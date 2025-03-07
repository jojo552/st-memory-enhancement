import {BASE, DERIVED, EDITOR, SYSTEM, USER} from '../manager.js';
import {updateSystemMessageTableStatus} from "./tablePushToChat.js";
import {findLastestTableData, findNextChatWhitTableData, getTableEditActionsStr, handleEditStrInMessage, parseTableEditTag, replaceTableEditTag,} from "../../index.js";
import {rebuildTableActions, refreshTableActions} from "./absoluteRefresh.js";
import {initAllTable} from "../source/tableActions.js";
import {openTablePopup} from "./tableDataView.js";

let tablePopup = null
let copyTableData = null
let selectedCell = null
const userTableEditInfo = {
    chatIndex: null,
    editAble: false,
    tables: null,
    tableIndex: null,
    rowIndex: null,
    colIndex: null,
}
let drag = null

/**
 * 表头编辑浮窗
 */
const tableHeaderEditToolbarDom = `
<div class="popup popup--animation-fast tableToolbar" id="tableHeaderToolbar">
    <button id="insertColumnLeft" class="menu_button">左侧插入列</button>
    <button id="insertColumnRight" class="menu_button">右侧插入列</button>
    <button id="deleteColumn" class="menu_button">删除列</button>
    <button id="renameColumn" class="menu_button">重命名列</button>
    <button id="sortColumnAsc" class="menu_button">升序排序</button>
    <button id="sortColumnDesc" class="menu_button">降序排序</button>
    <button id="filterColumn" class="menu_button">筛选列</button>
</div>`


let tableHeaderToolbar = null;


/**
 * 隐藏所有的编辑浮窗
 */
function hideAllEditPanels() {
    $(tableHeaderToolbar).hide();
}

/**
 * 处理表格中的单元格点击事件
 * @param {Event} event 点击事件
 */
function onTdClick(event) {
    if (selectedCell) {
        selectedCell.removeClass("selected");
    }
    selectedCell = $(this);
    selectedCell.addClass("selected");
    saveTdData(selectedCell.data("tableData"))
    // 计算工具栏位置
    const cellOffset = selectedCell.offset();
    const dragSpaceOffset = $(drag.dragSpace).offset(); // Get offset of dragSpace
    let relativeX = cellOffset.left - dragSpaceOffset.left; // Calculate relative to dragSpace (scaled)
    let relativeY = cellOffset.top - dragSpaceOffset.top;   // Calculate relative to dragSpace (scaled)

    // Correct for scale: divide by drag.scale to get position in unscaled dragSpace coordinates
    relativeX = relativeX / drag.scale;
    relativeY = relativeY / drag.scale;


    const clickedElement = event.target;
    hideAllEditPanels()
    if (clickedElement.tagName.toLowerCase() === "td") {
        // drag.move('tableToolbar', [relativeX, relativeY + 32]); // Use drag.move with corrected position
        // $(tableToolbar).show();
    } else if (clickedElement.tagName.toLowerCase() === "th") {
        drag.move('tableHeaderToolbar', [relativeX, relativeY + 32]); // Use drag.move with corrected position
        $(tableHeaderToolbar).show();
    }
    event.stopPropagation(); // 阻止事件冒泡
}


/**
 * 将保存的data数据字符串保存到设置中
 * @param {string} data 保存的data属性字符串
 */
function saveTdData(data) {
    const [tableIndex, rowIndex, colIndex] = data.split("-");
    userTableEditInfo.tableIndex = parseInt(tableIndex);
    userTableEditInfo.rowIndex = parseInt(rowIndex);
    userTableEditInfo.colIndex = parseInt(colIndex);
}

/**
 * 复制表格
 * @param {*} tables 所有表格数据
 */
export async function copyTable(tables = []) {
    copyTableData = JSON.stringify(tables)
    EDITOR.success('已复制')
}

/**
 * 粘贴表格
 * @param {number} mesId 需要粘贴到的消息id
 * @param {Element} tableContainer 表格容器DOM
 */
export async function pasteTable(mesId, tableContainer) {
    if (mesId === -1) {
        EDITOR.error("请至少让ai回复一条消息作为表格载体")
        return
    }
    const confirmation = await EDITOR.callGenericPopup('粘贴会清空原有的表格数据，是否继续？', EDITOR.POPUP_TYPE.CONFIRM, '', { okButton: "继续", cancelButton: "取消" });
    if (confirmation) {
        if (copyTableData) {
            const tables = JSON.parse(copyTableData)
            // checkPrototype(tables) // 这里假设 checkPrototype 函数已定义，如果未定义请自行实现
            USER.getContext().chat[mesId].dataTable = tables
            renderTablesDOM(tables, tableContainer, true)
            updateSystemMessageTableStatus();
            EDITOR.success('粘贴成功')
        } else {
            EDITOR.error("粘贴失败：剪切板没有表格数据")
        }
    }
}

/**
 * 导入表格
 * @param {number} mesId 需要导入表格的消息id
 */
async function importTable(mesId, tableContainer) {
    if (mesId === -1) {
        EDITOR.error("请至少让ai回复一条消息作为表格载体")
        return
    }

    // 1. 创建一个 input 元素，类型设置为 'file'，用于文件选择
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    // 设置 accept 属性，限制只能选择 JSON 文件，提高用户体验
    fileInput.accept = '.json';

    // 2. 添加事件监听器，监听文件选择的变化 (change 事件)
    fileInput.addEventListener('change', function(event) {
        // 获取用户选择的文件列表 (FileList 对象)
        const files = event.target.files;

        // 检查是否选择了文件
        if (files && files.length > 0) {
            // 获取用户选择的第一个文件 (这里假设只选择一个 JSON 文件)
            const file = files[0];

            // 3. 创建 FileReader 对象，用于读取文件内容
            const reader = new FileReader();

            // 4. 定义 FileReader 的 onload 事件处理函数
            // 当文件读取成功后，会触发 onload 事件
            reader.onload = function(loadEvent) {
                // loadEvent.target.result 包含了读取到的文件内容 (文本格式)
                const fileContent = loadEvent.target.result;

                try {
                    // 5. 尝试解析 JSON 数据
                    const tables = JSON.parse(fileContent)
                    // checkPrototype(tables) // 这里假设 checkPrototype 函数已定义，如果未定义请自行实现
                    USER.getContext().chat[mesId].dataTable = tables
                    renderTablesDOM(tables, tableContainer, true)
                    updateSystemMessageTableStatus();
                    EDITOR.success('导入成功')
                } catch (error) {
                    // 7. 捕获 JSON 解析错误，并打印错误信息
                    console.error("JSON 解析错误:", error);
                    alert("JSON 文件解析失败，请检查文件格式是否正确。");
                }
            };

            reader.readAsText(file, 'UTF-8'); // 建议指定 UTF-8 编码，确保中文等字符正常读取
        }
    });
    fileInput.click();
}

/**
 * 导出表格
 * @param {Array} tables 所有表格数据
 */
async function exportTable(tables = []) {
    if (!tables || tables.length === 0) {
        EDITOR.warning('当前表格没有数据，无法导出');
        return;
    }

    const jsonTables = JSON.stringify(tables, null, 2); // 使用 2 空格缩进，提高可读性
    const blob = new Blob([jsonTables], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const downloadLink = document.createElement('a');
    downloadLink.href = url;
    downloadLink.download = 'table_data.json'; // 默认文件名
    document.body.appendChild(downloadLink); // 必须添加到 DOM 才能触发下载
    downloadLink.click();
    document.body.removeChild(downloadLink); // 下载完成后移除

    URL.revokeObjectURL(url); // 释放 URL 对象

    EDITOR.success('已导出');
}

/**
 * 清空表格
 * @param {number} mesId 需要清空表格的消息id
 * @param {Element} tableContainer 表格容器DOM
 */
async function clearTable(mesId, tableContainer) {
    if (mesId === -1) return
    const confirmation = await EDITOR.callGenericPopup('清空此条的所有表格数据，是否继续？', EDITOR.POPUP_TYPE.CONFIRM, '', { okButton: "继续", cancelButton: "取消" });
    if (confirmation) {
        const emptyTable = initAllTable()
        USER.getContext().chat[mesId].dataTable = emptyTable
        renderTablesDOM(emptyTable, tableContainer, true)
        updateSystemMessageTableStatus();   // +.新增代码，将表格数据状态更新到系统消息中
        EDITOR.success('清空成功')
    }
}


/**
 * 在actions中插入值
 */
function addActionForInsert() {
    const newAction = new DERIVED.TableEditAction()
    newAction.setActionInfo("Insert", userTableEditInfo.tableIndex, userTableEditInfo.rowIndex, {})
    DERIVED.any.tableEditActions.push(newAction)
}

/**
 * 首行插入事件
 */
async function onInsertFirstRow() {
    const table = userTableEditInfo.tables[userTableEditInfo.tableIndex]
    const button = { text: '直接插入', result: 3 }
    const result = await EDITOR.callGenericPopup("请选择插入方式，目前伪装插入只能插入在表格底部<br/>注意：如果你本轮需要使用直接和伪装两种方式，请先做完所有伪装操作，再做直接操作，以避免表格混乱", EDITOR.POPUP_TYPE.CONFIRM, "", { okButton: "伪装为AI插入", cancelButton: "取消", customButtons: [button] })
    const tableContainer = tablePopup.dlg.querySelector('#tableContainer');
    if (result) {
        // 伪装输出
        if (result !== 3) {
            addActionForInsert()
            const chat = USER.getContext().chat[userTableEditInfo.chatIndex]
            replaceTableEditTag(chat, getTableEditActionsStr())
            handleEditStrInMessage(USER.getContext().chat[userTableEditInfo.chatIndex], -1)
            userTableEditInfo.tables = DERIVED.any.waitingTable
        } else {
            table.insertEmptyRow(0)
        }
        renderTablesDOM(userTableEditInfo.tables, tableContainer, true)
        updateSystemMessageTableStatus();
        USER.getContext().saveChat()
        EDITOR.success('已插入')
    }
}

/**
 * 渲染所有表格DOM及编辑栏
 * @param {Array} tables 所有表格数据
 * @param {Element} tableContainer 表格DOM容器
 * @param {boolean} isEdit 是否可以编辑
 */
export function renderTablesDOM(tables = [], tableContainer, isEdit = false) {
    $(tableContainer).empty()
    for (let table of tables) {
        $(tableContainer).append(table.render()).append(`<hr />`)
    }
    if (userTableEditInfo.editAble) {
        for (let table of tables) {
            table.cellClickEvent(onTdClick) // 绑定单元格点击事件
        }
    }
}

let initializedTableEdit = null
async function initTableEdit(mesId) {
    const table_editor_container = await SYSTEM.htmlToDom(await SYSTEM.getComponent('editor'), 'table_editor_container');
    const tableContainer = table_editor_container.querySelector('#tableContainer');
    const contentContainer = table_editor_container.querySelector('#contentContainer');
    // const tableContent = table_editor_container.querySelector('#tableContent');

    userTableEditInfo.editAble = findNextChatWhitTableData(mesId).index === -1

    tableHeaderToolbar = $(tableHeaderEditToolbarDom).hide();
    $(tableContainer).append(tableHeaderToolbar); // 将表头工具栏添加到 contentContainer

    // 初始化可拖动空间
    $(contentContainer).empty()
    drag = new EDITOR.Drag();
    contentContainer.append(drag.render);
    drag.add('tableContainer', tableContainer);
    drag.add('tableHeaderToolbar', tableHeaderToolbar[0]);


    // 开始寻找表格
    const { tables, index } = findLastestTableData(true, mesId)
    userTableEditInfo.chatIndex = index
    userTableEditInfo.tables = tables

    // 获取action信息
    if (userTableEditInfo.editAble && index !== -1 && (!DERIVED.any.waitingTableIndex || DERIVED.any.waitingTableIndex !== index)) {
        parseTableEditTag(USER.getContext().chat[index], -1, true)
    }

    // 渲染
    renderTablesDOM(userTableEditInfo.tables, tableContainer, userTableEditInfo.editAble)
    tables[0].cellClickEvent(callback => {
        console.log(callback)
    })

    // 根据 editAble 状态控制粘贴按钮的显示/隐藏
    if (!userTableEditInfo.editAble) {
        $('#contentContainer #paste_table_button').hide();
    } else {
        $('#contentContainer #paste_table_button').show();
    }

    initializedTableEdit = table_editor_container;
    return initializedTableEdit;
}


export async function getEditView(mesId = -1) {
    return initializedTableEdit || await initTableEdit(mesId);
}


/**
 * 打开表格展示/编辑弹窗
 * @param {number} mesId 需要打开的消息ID，-1为最新一条
 */
export async function openTableEditorPopup(mesId = -1) {
    const editView = initializedTableEdit || await getEditView(mesId); // 获取编辑视图的 DOM 结构
    tablePopup = new EDITOR.Popup(editView, EDITOR.POPUP_TYPE.TEXT, '', { large: true, wide: true, allowVerticalScrolling: true });
    await tablePopup.show();
}
