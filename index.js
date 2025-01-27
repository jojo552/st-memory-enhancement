import {
    eventSource,
    event_types,
    saveSettingsDebounced,
} from '../../../../script.js';
import { extension_settings, getContext, renderExtensionTemplateAsync } from '../../../extensions.js';
import { POPUP_TYPE, Popup } from '../../../popup.js';

// 默认插件设置
const defaultSettings = {
    injection_mode: 'deep_system',
    deep: -3,
    message_template: `# dataTable表格
dataTable是一个用于储存故事数据的csv格式表格，可以作为你推演下文的重要参考。推演的下文可以在表格基础上做出发展，并影响表格。
## A. 表格说明及数据
你可以在这里查看所有的表格数据，以及表格的说明。表格中表名格式为[tableIndex:表名]例如[2:角色特征表格];列名的格式为[colIndex:列名]例如[2:示例列];行名的格式为[rowIndex]。
{{tableData}}
# 增删改dataTable规则
当你生成正文后，根据下文的规则，如果判断数据dataTable中的内容需要增删改，则使用后文中的操作方法进行。
注意：
1. 当用户要求修改表格时，用户要求的优先级最高。
2. 当所有表格都为空时，应立即积极的根据上下文填充表格。
3. 插入行时，应上帝视角填写所有列，禁止写成未知或者空值。
4. 单元格中，不要出现逗号，语义分割应使用/代替。
5. 当表格中出现undefined、暂无时，应立即填充该单元格。
{{tableEditRules}}
# 增删改dataTable操作方法
你可以使用以下函数对表格的数据进行增删改操作。
## 1. 在某个表格中插入新行，使用insertRow函数：
insertRow(tableIndex:number, data:{[colIndex:number]:string|number})
例如：insertRow(0, {0: '2021-10-01', 1: '12:00', 2: '教室', 3: '悠悠'})
## 2. 在某个表格中删除行，使用deleteRow函数：
deleteRow(tableIndex:number, rowIndex:number)
例如：deleteRow(0, 0)
## 3. 在某个表格中更新行，使用updateRow函数：
updateRow(tableIndex:number, rowIndex:number, data:{[colIndex:number]:string|number})
例如：updateRow(0, 0, {3: '惠惠'})

你可以进行多次操作，然后将这些操作代码放入<tableEdit>标签中输出。
输出示例：
<tableEdit>
<!--
insertRow(0, {0: '2021-10-01', 1: '12:00', 2: '教室', 3: '惠惠/悠悠'})
insertRow(4, {0: '惠惠', 1: '惠惠向悠悠表白', 2: '2021-10-01', 3: '教室',4:'感动'})
updateRow(2, 0, {3: '喜欢'})
-->
</tableEdit>
`
};

// 默认的表格结构设置
const defaultTableData = [
    {
        tableName: "时空表格", tableIndex: 0, columns: ['日期', '时间', '地点（当前描写）', '此地角色'], columnsIndex: [0, 1, 2, 3], note: "记录时空信息的表格，应保持在一行",
        isertNode: '当此表格0行时应当插入一行', updateNode: "当描写的场景，时间，人物变更时", deleteNode: "此表大于一行时应删除多余行"
    },
    {
        tableName: '角色特征表格', tableIndex: 1, columns: ['角色名', '身体特征', '性格', '职业', '爱好', '喜欢的事物（作品、虚拟人物、物品等）', '住所', '其他重要信息'], note: '角色天生或不易改变的特征csv表格，思考本轮有否有其中的角色，他应作出什么反应',
        isertNode: '当上下文出现表中没有的新角色时，应插入/当此表为空时，应积极寻找上文中的已知角色', updateNode: "当角色的身体出现持久性变化时，例如伤痕/当角色有新的爱好，职业，喜欢的事物时/当角色更换住所时/当角色提到重要信息时", deleteNode: ""
    },
    {
        tableName: '角色与<user>社交表格', tableIndex: 2, columns: ['角色名', '对<user>关系', '对<user>态度', '对<user>好感'], note: '思考如果有角色和<user>互动，应什么态度',
        isertNode: '当上下文出现表中没有的新角色时，应插入/当此表为空时，应积极寻找上文中的已知角色', updateNode: "当角色和<user>的交互不再符合原有的记录时/当角色和<user>的关系改变时", deleteNode: ""
    },
    {
        tableName: '任务、命令或者约定表格', tableIndex: 3, columns: ['角色', '任务', '地点', '持续时间'], note: '思考本轮是否应该执行任务/赴约',
        isertNode: '当特定时间约定一起去做某事时/某角色收到做某事的命令或任务时', updateNode: "", deleteNode: "当大家赴约时/任务或命令完成时/任务，命令或约定被取消时"
    },
    {
        tableName: '重要事件历史表格', tableIndex: 4, columns: ['角色', '事件简述', '日期', '地点', '情绪'], note: '',
        isertNode: '当某个角色经历让自己印象深刻的事件时，比如表白、分手等', updateNode: "", deleteNode: ""
    },
    {
        tableName: '重要物品表格', tableIndex: 5, columns: ['拥有人', '物品描述', '物品名', '重要原因'], note: '对某人很贵重或有特殊纪念意义的物品',
        isertNode: '当某人获得了贵重或有特殊意义的物品时/当某个已有物品有了特殊意义时', updateNode: "", deleteNode: ""
    },
]

function loadSettings() {
    extension_settings.muyoo_dataTable = extension_settings.muyoo_dataTable || {};
    for (const key in defaultSettings) {
        if (!Object.hasOwn(extension_settings.muyoo_dataTable, key)) {
            extension_settings.muyoo_dataTable[key] = defaultSettings[key];
        }
    }
    $(`#dataTable_injection_mode option[value="${extension_settings.muyoo_dataTable.injection_mode}"]`).attr('selected', true);
    $('#dataTable_deep').val(extension_settings.muyoo_dataTable.deep);
    $('#dataTable_message_template').val(extension_settings.muyoo_dataTable.message_template);
}

function resetSettings() {
    extension_settings.muyoo_dataTable = {...defaultSettings};
    loadSettings();
    saveSettingsDebounced();
    toastr.success('已重置设置');
}

function initAllTable() {
    return defaultTableData.map(data => new Table(data.tableName, data.tableIndex, data.columns, data.note))
}

function checkPrototype(dataTable) {
    for (let i = 0; i < dataTable.length; i++) {
        if (!(dataTable[i] instanceof Table)) {
            const table = dataTable[i]
            dataTable[i] = new Table(table.tableName, table.tableIndex, table.columns, table.note, table.content)
        }
    }
}

/**
 * 寻找最新的表格数据，若没有，就新建一个
 * @param isIncludeEndIndex 搜索时是否包含endIndex
 * @param endIndex 结束索引，自此索引向上寻找，默认是最新的消息索引
 * @returns 自结束索引向上寻找，最近的表格数据
 */
function findLastestTableData(isIncludeEndIndex = false, endIndex = -1) {
    let chat = getContext().chat
    if (endIndex === -1) chat = isIncludeEndIndex ? chat : chat.slice(0, -1)
    else chat = chat.slice(0, isIncludeEndIndex ? endIndex + 1 : endIndex)
    for (let i = chat.length - 1; i >= 0; i--) {
        if (chat[i].is_user === false && chat[i].dataTable) {
            checkPrototype(chat[i].dataTable)
            return chat[i].dataTable
        }
    }
    for (let i = chat.length - 1; i >= 0; i--) {
        if (chat[i].is_user === false) {
            const newTableList = initAllTable()
            return newTableList
        }
    }
}

/**
 * 寻找下一个含有表格数据的消息，如寻找不到，则返回null
 * @param startIndex 开始寻找的索引
 * @returns 寻找到的mes数据
 */
function findNextChatWhitTableData(startIndex) {
    const chat = getContext().chat
    for (let i = startIndex; i < chat.length; i++) {

        if (chat[i].is_user === false && chat[i].dataTable) {
            checkPrototype(chat[i].dataTable)
            return { index: i, chat: chat[i] }
        }
    }
    return { index: - 1, chat: null }
}


export function initTableData() {
    const tables = findLastestTableData(true)
    const promptContent = getAllPrompt(tables)
    console.log("完整提示", promptContent)
    return promptContent
}

function getAllPrompt(tables) {
    const tableDataPrompt = tables.map(table => table.getTableText()).join('\n')
    return extension_settings.muyoo_dataTable.message_template.replace('{{tableData}}', tableDataPrompt).replace('{{tableEditRules}}', getTableEditRules())
}

function copyTableList(tableList) {
    return tableList.map(table => new Table(table.tableName, table.tableIndex, table.columns, table.note, JSON.parse(JSON.stringify(table.content))))
}

function handleCellValue(cell) {
    if (typeof cell === 'string') {
        return cell.replace(/,/g, "/")
    } else if (typeof cell === 'number') {
        return cell
    }
    return ''
}

class Table {
    constructor(tableName, tableIndex, columns, note = '', content = []) {
        this.tableName = tableName
        this.tableIndex = tableIndex
        this.columns = columns
        this.note = note
        this.content = content
    }

    getTableText() {
        const title = `* ${this.tableIndex}:${this.tableName}\n`
        const node = this.note && this.note !== '' ? '说明：' + this.note + '\n' : ''
        const headers = "rowIndex," + this.columns.map((colName, index) => index + ':' + colName).join(',') + '\n'
        const rows = this.content.length > 0 ? this.content.map((row, index) => index + ',' + row.join(',')).join('\n') + '\n' : ''
        return title + node + headers + rows
    }

    insert(data) {
        const newRow = []
        Object.entries(data).forEach(([key, value]) => { newRow[key] = handleCellValue(value) })
        this.content.push(newRow)
    }

    update(rowIndex, data) {
        const row = this.content[rowIndex]
        if (!row) return this.insert(data)
        Object.entries(data).forEach(([key, value]) => { row[key] = handleCellValue(value) })
    }

    delete(rowIndex) {
        this.content[rowIndex] = null
    }

    clearEmpty() {
        this.content = this.content.filter(Boolean)
    }

    render() {
        const container = document.createElement('div')
        container.classList.add('justifyLeft')
        container.classList.add('scrollable')
        const title = document.createElement('h3')
        title.innerText = this.tableName
        const table = document.createElement('table')
        table.classList.add('tableDom')
        const thead = document.createElement('thead')
        const titleTr = document.createElement('tr')
        this.columns.forEach(colName => {
            const th = document.createElement('th')
            th.innerText = colName
            titleTr.appendChild(th)
        })
        thead.appendChild(titleTr)
        table.appendChild(thead)
        const tbody = document.createElement('tbody')
        for (let row of this.content) {
            const tr = document.createElement('tr')
            for (let cell of row) {
                const td = document.createElement('td')
                td.innerText = cell
                tr.appendChild(td)
            }
            tbody.appendChild(tr)
        }
        table.appendChild(tbody)
        container.appendChild(title)
        container.appendChild(table)
        return container
    }
}

async function onChatChanged() {
    const chatMetadata = getContext().chatMetadata;
}

const getTableEditRules = () => {

    const insetRule = "## A. 新增规则\n" + defaultTableData.map(table => table.isertNode === '' ? null : `[${table.tableIndex}:${table.tableName}]：${table.isertNode}\n`).filter(Boolean).join('')
    const updateRule = "## B. 更新规则\n" + defaultTableData.map(table => table.updateNode === '' ? null : `[${table.tableIndex}:${table.tableName}]：${table.updateNode}\n`).filter(Boolean).join('')
    const deleteRule = "## C. 删除规则\n" + defaultTableData.map(table => table.deleteNode === '' ? null : `[${table.tableIndex}:${table.tableName}]：${table.deleteNode}\n`).filter(Boolean).join('')
    return insetRule + updateRule + deleteRule
}

let waitingTable = null
let tablePopup = null

function insertRow(tableIndex, data) {
    if (typeof tableIndex !== 'number') {
        toastr.error('insert tableIndex数据类型错误');
        return
    }
    const table = waitingTable[tableIndex]
    table.insert(data)
}

function deleteRow(tableIndex, rowIndex) {
    if (typeof tableIndex !== 'number' || typeof rowIndex !== 'number') {
        toastr.error('delete tableIndex或rowIndex数据类型错误，请重新生成本轮文本');
        return
    }
    const table = waitingTable[tableIndex]
    table.delete(rowIndex)
}

function updateRow(tableIndex, rowIndex, data) {
    if (typeof tableIndex !== 'number' || typeof rowIndex !== 'number') {
        toastr.error('update tableIndex或rowIndex数据类型错误，请重新生成本轮文本');
        return
    }
    const table = waitingTable[tableIndex]
    table.update(rowIndex, data)
}

function clearEmpty() {
    waitingTable.forEach(table => {
        table.clearEmpty()
    })
}

function handleTableEditTag(matches) {
    let functionList = []
    matches.forEach(match => {
        const functionStr = trimString(match)
        const newFunctionList = functionStr.split('\n').map(str => str.trim()).filter(str => str !== '')
        functionList = functionList.concat(newFunctionList)
    })
    return functionList
}

function isTableEditStrChanged(chat, matches) {
    if (chat.tableEditMatches != null && chat.tableEditMatches.join('') === matches.join('')) {
        return false
    }
    chat.tableEditMatches = matches
    return true
}

function executeTableEditFunction(functionList) {
    functionList.forEach(functionStr => {
        try {
            eval(fixFunctionNameError(functionStr))
        } catch (e) {
            toastr.error('表格操作函数执行错误，请重新生成本轮文本\n错误语句：' + functionStr + '\n错误信息：' + e.message);
        }
    })
}

function fixFunctionNameError(str) {
    if (str.startsWith("update(")) 
        return str.replace("update(", "updateRow(");
    if (str.startsWith("insert(")) 
        return str.replace("insert(", "insertRow(");
    if (str.startsWith("delete("))
        return str.replace("delete(", "deleteRow(");
    return str;
}

function handleEditStrInMessage(chat, mesIndex = -1, ignoreCheck = false) {
    const { matches, updatedText } = getTableEditTag(chat.mes)
    if (!ignoreCheck && !isTableEditStrChanged(chat, matches)) return
    const functionList = handleTableEditTag(matches)
    if (functionList.length === 0) return
    // 寻找最近的表格数据
    waitingTable = copyTableList(findLastestTableData(false, mesIndex))
    // 对最近的表格执行操作
    executeTableEditFunction(functionList)
    clearEmpty()
    chat.dataTable = waitingTable
    // 如果不是最新的消息，则更新接下来的表格
    if (mesIndex !== -1) {
        const { index, chat: nextChat } = findNextChatWhitTableData(mesIndex + 1)
        if (index !== -1) handleEditStrInMessage(nextChat, index, true)
    }
}

function getRealIndexInCollectionInDryRun(identifier, collection) {
    const newCollection = collection.filter(Boolean).filter(item => item.collection && item.collection.length !== 0)
    let index = 0
    for (let i in newCollection) {
        if (newCollection[i].identifier === identifier) break
        const newMes = newCollection[i].collection.filter((mes) => mes.content !== '')
        index += newMes.length
    }
    return index
}

function getRealIndexInCollection(identifier, collection) {
    const excludeList = ['newMainChat', 'newChat', 'groupNudge'];
    const shouldSquash = (message) => {
        return !excludeList.includes(message.identifier) && message.role === 'system' && !message.name;
    };
    let index = 0
    let isSquash = false
    for (let i in collection) {
        if (collection[i].identifier === identifier) break
    }
    return index
}

function getMesRole() {
    switch (extension_settings.muyoo_dataTable.injection_mode) {
        case 'deep_system':
            return 'system'
        case 'deep_user':
            return 'user'
        case 'deep_assistant':
            return 'assistant'
    }
}

async function onChatCompletionPromptReady(eventData) {
    if (eventData.dryRun === true) return
    const promptContent = initTableData()
    eventData.chat.splice(extension_settings.muyoo_dataTable.deep, 0, { role: getMesRole(), content: promptContent })
    /* console.log("dryRun", eventData.dryRun)
    console.log("chatCompletionPromptReady", promptManager)
    const prompts = promptManager.getPromptCollection();
    const systemPrompt = { role: 'system', content: promptContent, identifier: 'groupNudge' }
    const markerIndex = prompts.index("tableData");
    const newPrompt = promptManager.preparePrompt(systemPrompt);
    const message = await Message.fromPromptAsync(newPrompt);
    const messageCollection = new MessageCollection("tableData", message)
    if (promptManager.messages.collection[markerIndex] == null) promptManager.messages.collection[markerIndex] = messageCollection;
    if (false === eventData.dryRun) promptManager.render(false)
    const realIndex = getRealIndexInCollectionInDryRun('tableData', promptManager.messages.collection)
    eventData.chat.splice(realIndex, 0, { role: "system", content: promptContent }) */
    console.log("最终提示", eventData.chat)
}

function trimString(str) {
    return str
        .trim()
        .replace(/^\s*<!--|-->?\s*$/g, "")
        .trim()
}

function getTableEditTag(mes) {
    const regex = /<tableEdit>(.*?)<\/tableEdit>/gs;
    const matches = [];
    let match;
    while ((match = regex.exec(mes)) !== null) {
        matches.push(match[1]);
    }
    const updatedText = mes.replace(regex, "");
    return { matches, updatedText }
}

/**
 * 消息编辑时触发
 * @param this_edit_mes_id 此消息的ID
 */
async function onMessageEdited(this_edit_mes_id) {
    const chat = getContext().chat[this_edit_mes_id]
    handleEditStrInMessage(chat, parseInt(this_edit_mes_id))
}

/**
 * 消息接收时触发
 * @param {*} chat_id 此消息的ID
 */
async function onMessageReceived(chat_id) {
    const chat = getContext().chat[chat_id];
    handleEditStrInMessage(chat)
}

async function openTablePopup(mesId = -1) {
    const manager = await renderExtensionTemplateAsync('third-party/st-memory-enhancement', 'manager');
    tablePopup = new Popup(manager, POPUP_TYPE.TEXT, '', { large: true, wide: true, allowVerticalScrolling: true });
    tablePopup.dlg.addEventListener('focusin', () => renderTableData(mesId))
    await tablePopup.show()
}

function renderTableData(mesId = -1) {
    const tableContainer = document.getElementById('tableContainer')
    tableContainer.innerHTML = ''
    const tables = findLastestTableData(true, mesId)
    for (let table of tables) {
        tableContainer.appendChild(table.render())
    }
}

jQuery(async () => {
    fetch("http://api.muyoo.com.cn/check-version", {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientVersion: '1.0.0' })
    }).then(res => res.json()).then(res => {
        if (res.success) {
            if (!res.isLatest) $("#tableUpdateTag").show()
            if (res.toastr) toastr.warning(res.toastrText)
            if (res.message) $("#table_message_tip").text(res.message)
        }
    })
    const html = await renderExtensionTemplateAsync('third-party/st-memory-enhancement', 'index');
    const buttonHtml = await renderExtensionTemplateAsync('third-party/st-memory-enhancement', 'buttons');
    const button = `
    <div title="查看表格" class="mes_button open_table_by_id">
        表格
    </div>`;
    $('#data_bank_wand_container').append(buttonHtml);
    $('.extraMesButtons').append(button);
    $('#translation_container').append(html);
    $(document).on('pointerup', '.open_table_by_id', function () {
        try {
            const messageId = $(this).closest('.mes').attr('mesid');
            openTablePopup(parseInt(messageId));
        } catch (err) {
            console.error('Failed to copy: ', err);
        }
    });
    loadSettings();
    $('#dataTable_injection_mode').on('change', (event) => {
        extension_settings.muyoo_dataTable.injection_mode = event.target.value;
        saveSettingsDebounced();
    });
    $('#dataTable_message_template').on("input", function () {
        const value = $(this).val();
        extension_settings.muyoo_dataTable.message_template = value;
        saveSettingsDebounced();
    })
    $('#dataTable_deep').on("input", function () {
        const value = $(this).val();
        extension_settings.muyoo_dataTable.deep = value;
        saveSettingsDebounced();
    })
    $("#open_table").on('click', () => openTablePopup());
    $("#reset_settings").on('click', () => resetSettings());
    eventSource.on(event_types.CHAT_CHANGED, onChatChanged);
    eventSource.on(event_types.MESSAGE_RECEIVED, onMessageReceived);
    eventSource.on(event_types.CHAT_COMPLETION_PROMPT_READY, onChatCompletionPromptReady);
    eventSource.on(event_types.MESSAGE_EDITED, onMessageEdited);
});
