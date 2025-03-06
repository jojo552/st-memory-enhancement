import {BASE, DERIVED, EDITOR, SYSTEM, USER} from '../manager.js';
import {findLastestTableData, findTableStructureByIndex} from "../../index.js";
import JSON5 from '../../utils/json5.min.mjs'

/**
 * 解析html，将其中代表表格单元格的\$\w\d+字符串替换为对应的表格单元格内容
 * 对于任意\$\w\d+字符串，其中\w为表格的列数，\d+为表格的行数，例如$B3表示表格第二列第三行的内容，行数从header行开始计数，header行为0
 * */
function parseTableRender(html, table) {
    if (!html) {
        return table.render(); // 如果html为空，则直接返回
    }
    if (!table || !table.content || !table.columns) return html;
    html = html.replace(/\$(\w)(\d+)/g, function (match, colLetter, rowNumber) {
        const colIndex = colLetter.toUpperCase().charCodeAt(0) - 'A'.charCodeAt(0); // 将列字母转换为列索引 (A=0, B=1, ...)
        const rowIndex = parseInt(rowNumber);
        const r = `<span style="color: red">无单元格</span>`;
        try {
            return rowIndex === 0
                ? table.columns[colIndex]                   // 行数从header行开始计数，header行为0
                : table.content[rowIndex - 1][colIndex];    // content的行数从1开始
        } catch (error) {
            console.error(`Error parsing cell ${match}:`, error);
            return r;
        }
    });
    return html;
}

/**
 * 将table数据推送至聊天内容中显示
 * @param tableStatusHTML 表格状态html
 */
function replaceTableToStatusTag(tableStatusHTML) {
    const r = USER.tableBaseConfig.to_chat_container.replace(/\$0/g, `<tableStatus>${tableStatusHTML}</tableStatus>`);
    const chatContainer = window.document.querySelector('#chat');
    let tableStatusContainer = chatContainer?.querySelector('#tableStatusContainer');

    // 定义具名的事件监听器函数
    const touchstartHandler = function(event) {
        event.stopPropagation();
    };
    const touchmoveHandler = function(event) {
        event.stopPropagation();
    };
    const touchendHandler = function(event) {
        event.stopPropagation();
    };

    setTimeout(() => {
        if (tableStatusContainer) {
            // 移除之前的事件监听器，防止重复添加 (虽然在这个场景下不太可能重复添加)
            tableStatusContainer.removeEventListener('touchstart', touchstartHandler);
            tableStatusContainer.removeEventListener('touchmove', touchmoveHandler);
            tableStatusContainer.removeEventListener('touchend', touchendHandler);
            chatContainer.removeChild(tableStatusContainer); // 移除旧的 tableStatusContainer
        }
        chatContainer.insertAdjacentHTML('beforeend', `<div class="wide100p" id="tableStatusContainer">${r}</div>`);
        // 获取新创建的 tableStatusContainer
        const newTableStatusContainer = chatContainer?.querySelector('#tableStatusContainer');
        if (newTableStatusContainer) {
            // 添加事件监听器，使用具名函数
            newTableStatusContainer.addEventListener('touchstart', touchstartHandler, { passive: false });
            newTableStatusContainer.addEventListener('touchmove', touchmoveHandler, { passive: false });
            newTableStatusContainer.addEventListener('touchend', touchendHandler, { passive: false });
        }
        // 更新 tableStatusContainer 变量指向新的元素，以便下次移除
        tableStatusContainer = newTableStatusContainer;
    }, 0);
}

/**
 * 更新最后一条 System 消息的 <tableStatus> 标签内容
 */
export function updateSystemMessageTableStatus(eventData) {
    if (USER.tableBaseConfig.isExtensionAble === false || USER.tableBaseConfig.isTableToChat === false) {
        window.document.querySelector('#tableStatusContainer')?.remove();
        return;
    }

    const tables = findLastestTableData(true).tables;
    let tableStatusHTML = '';
    for (let i = 0; i < tables.length; i++) {
        const structure = findTableStructureByIndex(i);
        if (!structure.enable || !structure.toChat) continue;
        // 如果有自定义渲染器，则使用自定义渲染器，否则使用默认渲染器
        tableStatusHTML += structure.tableRender
            ? parseTableRender(structure.tableRender, tables[i])
            : tables[i].render().outerHTML;
    }
    replaceTableToStatusTag(tableStatusHTML);
}

/**
 * +.新增代码，打开自定义表格推送渲染器弹窗
 * @returns {Promise<void>}
 */
export async function openTableRendererPopup() {
    const manager = await SYSTEM.getComponent('renderer');
    const tableRendererPopup = new EDITOR.Popup(manager, EDITOR.POPUP_TYPE.TEXT, '', { large: true, wide: true, allowVerticalScrolling: true });
    const tableStructure = findTableStructureByIndex(DERIVED.any._currentTableIndex);
    const table = findLastestTableData(true).tables[DERIVED.any._currentTableIndex];
    const $dlg = $(tableRendererPopup.dlg);
    const $htmlEditor = $dlg.find('#htmlEditor');
    const $tableRendererDisplay = $dlg.find('#tableRendererDisplay');

    const tableRenderContent = tableStructure?.tableRender || "";
    // $tablePreview.html(tablePreview.render().outerHTML);
    $htmlEditor.val(tableRenderContent);

    // 修改中实时渲染
    const renderHTML = () => {
        $tableRendererDisplay.html(parseTableRender($htmlEditor.val(), table));
    };
    renderHTML();
    $htmlEditor.on('input', renderHTML); // 监听 input 事件，实时渲染

    await tableRendererPopup.show();
    tableStructure.tableRender = $htmlEditor.val();
    DERIVED.any._currentTablePD.find('#dataTable_tableSetting_tableRender').val($htmlEditor.val());
}
