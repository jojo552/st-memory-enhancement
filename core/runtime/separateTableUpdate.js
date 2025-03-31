import {BASE, DERIVED, EDITOR, SYSTEM, USER} from '../../manager.js';
import {refreshTableActions} from "./absoluteRefresh.js";

let toBeExecuted = [];

/**
 * 初始化两步总结所需的数据
 * @param chat
 * */
function InitChatForTableTwoStepSummary(chat) {
    // 如果currentPiece.uid未定义，则初始化为随机字符串
    if (chat.uid === undefined) {
        chat.uid = SYSTEM.generateRandomString(22);
    }
    // 如果currentPiece.uid_that_references_table_step_update未定义，则初始化为{}
    if (chat.two_step_links === undefined) {
        chat.two_step_links = {};
    }
    // 如果currentPiece.uid_that_references_table_step_update未定义，则初始化为{}
    if (chat.two_step_waiting === undefined) {
        chat.two_step_waiting = {};
    }
}

/**
 * 获取当前滑动对话的唯一标识符
 * @param chat
 * @returns {string}
 */
function getSwipeUid(chat) {
    // 初始化chat
    InitChatForTableTwoStepSummary(chat);
    // 获取当前swipe的唯一标识符
    const swipeUid = `${chat.uid}_${chat.swipe_id}`;
    // 检查当前swipe是否已经存在必要的数据结构
    if (!(swipeUid in chat.two_step_links)) chat.two_step_links[swipeUid] = [];
    if (!(swipeUid in chat.two_step_waiting)) chat.two_step_waiting[swipeUid] = true;
    return swipeUid;
}

/**
 * 检查当前chat是否已经被父级chat执行过
 * @param chat
 * @param targetSwipeUid
 * @returns {*}
 */
function checkIfChatIsExecuted(chat, targetSwipeUid) {
    const chatSwipeUid = getSwipeUid(chat); // 获取当前chat的唯一标识符
    const chatExecutedSwipes = chat.two_step_links[chatSwipeUid]; // 获取当前chat已经执行过的父级chat
    return chatExecutedSwipes.includes(targetSwipeUid);   // 检查当前chat是否已经被目标chat执行过
}

/**
 * 处理对话中的标识符
 * @param string
 * @returns {string}
 */
function handleMessages(string) {
    let r = string.replace(/<(tableEdit|think|thinking)>[\s\S]*?<\/\1>/g, '');

    return r;
}

function MarkChatAsWaiting(chat, swipeUid) {
    console.log(USER.getContext().chat);
    console.log(chat.two_step_links);
    console.log(chat.two_step_waiting);
    chat.two_step_waiting[swipeUid] = true;
}

/**
 * 获取未执行的两步总结
 * @returns {string}
 * @param parentSwipeUid
 */
function GetUnexecutedMarkChats(parentSwipeUid) {
    const chats = USER.getContext().chat;
    let r = '';
    let lastChat = null;
    let cacheChat = null;
    let round = 0;

    for (let i = chats.length - 1; i >= 0; i--) {
        const chat = chats[i];
        if (chat.is_user === true) {
            toBeExecuted.unshift(chat);
            continue;
        }
        lastChat = cacheChat;
        cacheChat = chat;
        round++;

        // 如果当前对话已经被执行过，则跳过
        const iSwipeUid = getSwipeUid(chat);
        const isExecutedBySelf = checkIfChatIsExecuted(chat, iSwipeUid);
        if (isExecutedBySelf) break;
        const isExecutedByParent = checkIfChatIsExecuted(chat, parentSwipeUid);
        if (isExecutedByParent) break;

        // 将当前对话加入待执行列表
        toBeExecuted.unshift(chat);

        // 如果对话长度未达到阈值，则直接继续往前找
        if (r.length < USER.tableBaseSetting.step_by_step_threshold) continue;

        // 如果对话长度达到阈值，则通过标识符判断是否需要继续往前找
        const lastChatSwipeUid = getSwipeUid(lastChat);
        const isWaiting = chat.two_step_waiting[iSwipeUid] === true;
        if (!isWaiting) break;
    }
    return r;
}

/**
 * 执行两步总结
 * */
export async function TableTwoStepSummary() {
    if (USER.tableBaseSetting.isExtensionAble === false || USER.tableBaseSetting.step_by_step === false) return

    // 获取当前对话
    const chats = USER.getContext().chat;
    const currentPiece = chats[chats.length - 1];
    if (currentPiece.is_user === true) return;

    const swipeUid = getSwipeUid(currentPiece);
    if (currentPiece.mes.length < 20) {
        console.log('当前对话长度过短, 跳过执行分步总结: ', currentPiece.mes);
        MarkChatAsWaiting(currentPiece, swipeUid);
        return;
    }

    // 如果不开启多轮累计
    if (USER.tableBaseSetting.sum_multiple_rounds === false) {
        // 如果当前对话长度未达到阈值，则跳过，待出现能够执行的对话时再一起执行
        if (currentPiece.mes.length < USER.tableBaseSetting.step_by_step_threshold) {
            console.log('当前对话长度未达到阈值, 跳过执行分步总结: ', currentPiece.mes);
            MarkChatAsWaiting(currentPiece, swipeUid);
            return;
        }
    }

    // 往前找到所有未执行的两步总结
    toBeExecuted = [];
    GetUnexecutedMarkChats(swipeUid);

    // 如果没有找到需要执行的两步总结，则跳过
    if (toBeExecuted.length === 0) {
        console.log('未找到需要执行的两步总结: ', currentPiece.mes);
        MarkChatAsWaiting(currentPiece, swipeUid);
        return;
    }

    // 获取需要执行的两步总结
    let todoChats = toBeExecuted.map(chat => chat.mes).join('');

    // 再次检查是否达到执行两步总结的阈值
    if (todoChats.length < USER.tableBaseSetting.step_by_step_threshold) {
        console.log('需要执行两步总结的对话长度未达到阈值: ', `(${todoChats.length}) `, toBeExecuted);
        MarkChatAsWaiting(currentPiece, swipeUid);
        return;
    }

    // 检查是否开启执行前确认
    EDITOR.confirm(`累计 ${todoChats.length} 长度的待总结文本，是否执行两步总结？`, '取消', '执行两步总结').then(async (result) => {
        if (result === false) {
            console.log('用户取消执行两步总结: ', `(${todoChats.length}) `, toBeExecuted);
            MarkChatAsWaiting(currentPiece, swipeUid);
            return false;
        } else {
            const r = await refreshTableActions(true, true, todoChats);   // 执行两步总结

            if (!r || r === '' || r === 'error') {
                console.log('执行两步总结失败: ', `(${todoChats.length}) `, toBeExecuted);
                MarkChatAsWaiting(currentPiece, swipeUid);
                return false;
            }

            if (r === 'suspended') {
                console.log('用户取消执行两步总结: ', `(${todoChats.length}) `, toBeExecuted);
                MarkChatAsWaiting(currentPiece, swipeUid);
                return false;
            }

            toBeExecuted.forEach(chat => {
                const chatSwipeUid = getSwipeUid(chat);
                chat.two_step_links[chatSwipeUid].push(swipeUid);   // 标记已执行的两步总结
            })
            toBeExecuted = [];

            return true;
        }
    })
}
