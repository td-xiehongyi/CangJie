const names:Record<string,string>={
 'Update ticket title only':'修改工单标题',
 'Create ticket with de-duplication':'提交工单并避免重复创建',
 'Query my tickets (private) with completeness metadata':'查询本人提交的工单',
 'Startup / Database initialization':'启动与初始化测试数据库',
 'Login and authentication':'登录与身份验证',
 'Demo UI session and persistence behavior':'演示页面与会话保存',
};
/** Display only; source labels and saved rule semantics remain unchanged. */
export function businessName(value:string,index=0):string{return names[value]??(/[\u3400-\u9fff]/.test(value)?value:`项目业务${index+1}`)}
export function businessText(value:string,translations:Record<string,string>={}):string{return Object.hasOwn(translations,value)?translations[value]:value}

const ruleExpectations:Record<string,string>={
 'submitted title persists':'提交的标题应正确保存',
 'same business intent produces one record':'同一业务意图只产生一条记录',
 'other account cannot view owner record':'其他账号不能查看本次提交者的记录',
 'only title changes to requested value':'仅将标题改为本次请求的内容',
 'priority unchanged':'优先级不变',
 'ownerId unchanged':'记录所有者不变'
};
/** Exact phrase translations only; the original rule remains available in report details. */
export function ruleExpectedText(value:string):string{return ruleExpectations[value]??value;}
