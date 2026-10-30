'use strict';
/* ================================================================
   nce-shared.js — 游戏与分析工具的共享数据源（UMD 单文件）
   - 浏览器：<script src="nce-shared.js"></script> → window.NCE_SHARED
   - Node：  const {QUESTIONS,...} = require('./nce-shared.js')
   这里是 QUESTIONS / VERB_DB / maskLeaks / FAIRY_SYS / LLM_MODEL 的唯一权威源。
   分析脚本（analyze-session.js / fairy-audit.js）直接 require 本文件，
   不再从 HTML 里做字符串切片 + eval 抠数据——「零漂移」从脆弱技巧变成结构保证。
================================================================ */
(function(root, factory){
  if(typeof module==='object'&&module.exports){ module.exports=factory(); }
  else{ root.NCE_SHARED=factory(); }
})(typeof self!=='undefined'?self:this, function(){

/* 统一模型常量：日志与 A/B 对比全靠它区分数据来源 */
const LLM_MODEL='qwen/qwen3.5-9b';

/* ================================================================
   题库（源自两份速查表 PDF，d=1/2/3 难度，s=出处）
================================================================ */
const QUESTIONS=[
 /* ---- 难度 1 · 动词过去式 + 基础问句（新手草原） ---- */
 {d:1,s:'动词速查表·不规则变形',q:'go 的过去式是？',o:['went','goed','gone','goes'],a:0},
 {d:1,s:'动词速查表·不规则变形',q:'eat 的过去式是？',o:['ate','eated','eaten','eats'],a:0},
 {d:1,s:'动词速查表·不规则变形',q:'see 的过去式是？',o:['saw','seed','seen','sees'],a:0},
 {d:1,s:'动词速查表·不规则变形',q:'take 的过去式是？',o:['took','taked','taken','takes'],a:0},
 {d:1,s:'动词速查表·AAA 三形同形',q:'put 的过去式是？',o:['put','putted','puted','putting'],a:0},
 {d:1,s:'动词速查表·不规则变形',q:'meet 的过去式是？',o:['met','meeted','meted','meeting'],a:0},
 {d:1,s:'动词速查表·ABA 三形',q:'come 的过去式是？',o:['came','come','comed','coming'],a:0},
 {d:1,s:'动词速查表·AAA 三形同形',q:'cost 的过去式是？',o:['cost','costed','costs','costing'],a:0},
 {d:1,s:'疑问句型速查表·请求/邀请',q:'"Can you help me?" 是在向别人？',o:['请求帮助','告别','道歉','介绍自己'],a:0},
 {d:1,s:'疑问句型速查表·问候寒暄',q:'"How are you?" 属于哪类问句？',o:['问候寒暄','告别','道歉','请求'],a:0},
 {d:1,s:'疑问句型速查表·一般疑问句',q:'"Is this your pen?" 的正确回答是？',o:['Yes, it is.','Yes, I am.','Yes, I do.','Yes, I can.'],a:0},
 {d:1,s:'疑问句型速查表·一般疑问句',q:'一般疑问句通常用什么回答？',o:['Yes 或 No','说时间','说地点','说人名'],a:0},
 {d:1,s:'动词速查表·不规则变形',q:'drink 的过去式是？',o:['drank','drunk','drinked','drinks'],a:0},
 {d:1,s:'动词速查表·AAA 三形同形',q:'read 的过去式拼写？',o:['read（拼写不变）','readed','redded','reading'],a:0},
 {d:1,s:'动词速查表·ABB 三形 L49',q:'tell 的过去式是？',o:['told','telled','tollded','tells'],a:0},
 {d:1,s:'动词速查表·ABB 三形 L29',q:'make 的过去式是？',o:['made','maked','makd','making'],a:0},
 {d:1,s:'动词速查表·ABB 三形 L43',q:'find 的过去式是？',o:['found','finded','founded','finds'],a:0},
 {d:1,s:'动词速查表·ABB 三形 L25',q:'leave 的过去式是？',o:['left','leaved','leaveded','leaves'],a:0},
 {d:1,s:'动词速查表·ABB 三形 L63',q:'keep 的过去式是？',o:['kept','keeped','kepped','keeps'],a:0},
 {d:1,s:'动词速查表·ABB 三形 L73',q:'lose 的过去式是？',o:['lost','losed','losst','loses'],a:0},
 {d:1,s:'动词速查表·ABB 三形 L61',q:'say 的过去式是？',o:['said','sayed','saied','says'],a:0},
 {d:1,s:'动词速查表·ABB 三形 L89',q:'sell 的过去式是？',o:['sold','selled','solded','sells'],a:0},
 {d:1,s:'动词速查表·ABB 三形 L61',q:'feel 的过去式是？',o:['felt','feeled','fealt','feels'],a:0},
 {d:1,s:'动词速查表·ABB 三形 L119',q:'sleep 的过去式是？',o:['slept','sleeped','slepped','sleeps'],a:0},
 {d:1,s:'动词速查表·ABB 三形 L67',q:'spend 的过去式是？',o:['spent','spended','spennt','spends'],a:0},
 {d:1,s:'动词速查表·ABB 三形 L95',q:'catch 的过去式是？',o:['caught','catched','caucht','catchs'],a:0},
 {d:1,s:'动词速查表·ABB 三形 L137',q:'win 的过去式是？',o:['won','winned','wanned','wins'],a:0},
 {d:1,s:'动词速查表·AAA 三形同形 L29',q:'shut 的过去式是？',o:['shut','shutted','shuted','shutting'],a:0},
 {d:1,s:'动词速查表·AAA 三形同形 L99',q:'hurt 的过去式是？',o:['hurt','hurted','hurtted','hurts'],a:0},
 {d:1,s:'疑问句型速查表·问候寒暄 L5',q:'"How do you do?" 的正确回答是？',o:['How do you do?','I am fine, thanks.','Yes, I do.','And you?'],a:0},
 {d:1,s:'疑问句型速查表·what-疑问句 L7',q:'"What is your job?" 询问？',o:['职业','姓名','年龄','住址'],a:0},
 {d:1,s:'疑问句型速查表·一般疑问句 L7',q:'"Are you a teacher?" 属于？',o:['一般疑问句','特殊疑问句','反意疑问句','选择疑问句'],a:0},

 /* ---- 难度 2 · 动词三形 + 句型判断（熔岩洞穴） ---- */
 {d:2,s:'动词速查表·ABB 三形',q:'buy — ___ · bought 属于哪种不规则变形？',o:['ABB（过去式=过去分词）','AAA（三形同形）','ABC（三形都不同）','ABA（原形=过去分词）'],a:0},
 {d:2,s:'动词速查表·不规则变形',q:'write 的过去分词是？',o:['written','wrote','writed','writing'],a:0},
 {d:2,s:'动词速查表·不规则变形',q:'speak 的过去分词是？',o:['spoken','spoke','speaked','speaking'],a:0},
 /* forget 的过去分词不再单出 d2 题：与 d3 的「中哪个是过去分词」变体属同一考点
    （审计发现 2 第 10 组），归一化去重口径下保留 d3 变体即可 */
 {d:2,s:'动词速查表·ABC 三形',q:'give — gave · given 属于哪种变形？',o:['ABC（三形都不同）','ABB','AAA','ABA'],a:0},
 {d:2,s:'疑问句型速查表·选择疑问句',q:'"Do you like tea or coffee?" 属于？',o:['选择疑问句','一般疑问句','反意疑问句','特殊疑问句'],a:0},
 {d:2,s:'疑问句型速查表·where 疑问句',q:'"Where do you come from?" 询问的是？',o:['来自哪里','姓名','年龄','爱好'],a:0},
 {d:2,s:'疑问句型速查表·特殊疑问句',q:'特殊疑问句必须以什么开头？',o:['疑问词（what/where…）','动词','形容词','冠词'],a:0},
 {d:2,s:'疑问句型速查表·how 短语',q:'"How long have you lived here?" 询问？',o:['居住了多久','住在哪','和谁住','房子多大'],a:0},
 {d:2,s:'动词速查表·情态/请求',q:'"Can I have the key to the front door?" 中 can 表示？',o:['请求许可','过去的能力','禁止','命令'],a:0},
 {d:2,s:'动词速查表·不规则变形',q:'understand 的过去式是？',o:['understood','understanded','understanding','understooded'],a:0},
 {d:2,s:'疑问句型速查表·whose 疑问句',q:'"Whose pen is that?" 询问？',o:['归属（谁的）','地点','时间','方式'],a:0},
 {d:2,s:'动词速查表·接 sb to do',q:'下面哪句是正确的 want sb to do 结构？',o:['I want you to type it again.','I want typing it again.','I want you type it again.','I want to you type it.'],a:0},
 {d:2,s:'动词速查表·ABC 三形',q:'drink — drank · drunk 属于哪种变形？',o:['ABC（三形都不同）','ABB','AAA','ABA'],a:0},
 {d:2,s:'动词速查表·ABB 三形 L87',q:'bring 的过去式是？',o:['brought','bringed','brang','bringd'],a:0},
 {d:2,s:'动词速查表·ABB 三形 L91',q:'think 的过去式是？',o:['thought','thinked','thank','thinks'],a:0},
 {d:2,s:'动词速查表·ABB 三形 L35',q:'build 的过去式是？',o:['built','builded','build','builds'],a:0},
 {d:2,s:'动词速查表·ABB 三形 L65',q:'hear 的过去式是？',o:['heard','heared','hared','hears'],a:0},
 {d:2,s:'动词速查表·ABB 三形 L105',q:'spell 的过去式是？',o:['spelt','spell','spalt','spells'],a:0},
 {d:2,s:'动词速查表·ABC 三形 L141',q:'begin — began · ___ 补全三形？',o:['begun','beginned','beganed','begon'],a:0},
 {d:2,s:'动词速查表·ABC 三形 L87',q:'drive 的过去分词是？',o:['driven','drove','drived','drivening'],a:0},
 {d:2,s:'动词速查表·ABC 三形 L99',q:'fall 的过去分词是？',o:['fallen','fell','falled','falling'],a:0},
 {d:2,s:'动词速查表·ABC 三形 L73',q:'know 的过去分词是？',o:['known','knew','knowed','knowen'],a:0},
 {d:2,s:'动词速查表·ABC 三形 L123',q:'grow 的过去分词是？',o:['grown','grew','growed','growen'],a:0},
 {d:2,s:'动词速查表·ABC 三形 L61',q:'show 的过去分词是？',o:['shown','show','showned','showen'],a:0},
 {d:2,s:'动词速查表·ABC 三形 L143',q:'throw 的过去分词是？',o:['thrown','threw','throwed','throwen'],a:0},
 {d:2,s:'疑问句型速查表·what-疑问句 L61',q:'"What is the matter with him?" 询问？',o:['身体状况','姓名','爱好','职业'],a:0},
 {d:2,s:'疑问句型速查表·when-疑问句 L87',q:'"When did you bring it to us?" 询问？',o:['时间','地点','人物','价格'],a:0},
 {d:2,s:'疑问句型速查表·were-疑问句 L67',q:'"Were you at the butcher\'s?" 属于？',o:['一般疑问句（过去时）','特殊疑问句','反意疑问句','选择疑问句'],a:0},
 {d:2,s:'疑问句型速查表·have-疑问句 L85',q:'"Have you just been to the cinema?" 的时态是？',o:['现在完成时','一般过去时','一般现在时','过去进行时'],a:0},
 {d:2,s:'疑问句型速查表·which-疑问句 L121',q:'"Which book did you buy?" 询问？',o:['哪一个','为什么','什么时候','怎么样'],a:0},

 /* ---- 难度 3 · 反意/选择疑问 + 难词变形（寒冰王座） ---- */
 /* 注：rise/fly/begin 的过去分词题手工放在 d3，与生成器惯例（ABC→d2）不同——
    刻意安排，给第 3 章凑难词深度，勿当 bug "改回" d2（审计发现 4） */
 {d:3,s:'疑问句型速查表·反意疑问句 L101',q:'"He doesn\'t look very well, ___?" 反意部分应填？',o:['does he',"doesn't he",'is he',"isn't he"],a:0},
 {d:3,s:'疑问句型速查表·反意疑问句 L131',q:'"It is cold, ___?" 反意部分应填？',o:["isn't it",'is it','does it',"doesn't it"],a:0},
 {d:3,s:'疑问句型速查表·how 短语 L111',q:'"How much does this dress cost?" 询问？',o:['价格','长度','时间','距离'],a:0},
 {d:3,s:'动词速查表·ABB 三形',q:'mean 的过去式是？',o:['meant','meaned','ment','means'],a:0},
 {d:3,s:'动词速查表·ABC 三形',q:'wear 的三种形式是？',o:['wear — wore — worn','wear — weared — worn','wear — wore — weared','wear — worn — wore'],a:0},
 {d:3,s:'动词速查表·ABC 三形',q:'rise 的过去分词是？',o:['risen','rose','rised','rising'],a:0},
 {d:3,s:'动词速查表·ABC 三形',q:'swim — swam · swum 属于哪种变形？',o:['ABC（三形都不同）','ABB','AAA','ABA'],a:0},
 {d:3,s:'动词速查表·ABC 三形',q:'fly 的过去分词是？',o:['flown','flew','flyed','flying'],a:0},
 {d:3,s:'疑问句型速查表·请求/邀请',q:'"Would you like some tea?" 属于？',o:['委婉邀请','询问能力','责备','命令'],a:0},
 {d:3,s:'疑问句型速查表·请求/邀请 L89',q:'"May I have a look at it?" 表示？',o:['请求许可','禁止','遗憾','惊讶'],a:0},
 {d:3,s:'疑问句型速查表·建议/提议',q:'"What about some coffee?" 属于？',o:['建议/提议','特殊疑问句','反意疑问句','问候寒暄'],a:0},
 {d:3,s:'动词速查表·ABB 三形',q:'shine 的过去式是？',o:['shone','shine','shon','shining'],a:0},
 /* 审计发现 6：shined 是 shine（及物"擦亮"义）的合法过去式，与 shone（发光）并存，
    放选项里会出双解死局——已换成原形干扰。show/spell 的美式合法形式同理处理 */
 {d:3,s:'动词速查表·ABB 三形',q:'pay 的过去式是？',o:['paid','payed','pay','paying'],a:0},
 {d:3,s:'疑问句型速查表·反意疑问句 L127',q:'"That was a good idea, ___?" 反意部分应填？',o:["wasn't it",'was it',"isn't it",'did it'],a:0},
 {d:3,s:'疑问句型速查表·反意疑问句 L103',q:'"Those flowers are lovely, ___?" 反意部分应填？',o:["aren't they",'are they',"isn't it",'is it'],a:0},
 {d:3,s:'疑问句型速查表·反意疑问句 L123',q:'"It isn\'t you, ___?" 反意部分应填？（注意前句是否定）',o:['is it',"isn't it",'are you',"aren't you"],a:0},
 {d:3,s:'疑问句型速查表·反意疑问句 L127',q:'"She does, ___?" 反意部分应填？',o:["doesn't she",'does she',"isn't she",'does he'],a:0},
 {d:3,s:'疑问句型速查表·反意疑问句 L135',q:'"That is your suitcase, ___?" 反意部分应填？',o:["isn't it",'is it',"doesn't it",'was it'],a:0},
 {d:3,s:'疑问句型速查表·反意疑问句 L139',q:'"You are working hard, ___?" 反意部分应填？',o:["aren't you",'are you',"don't you","aren't they"],a:0},
 {d:3,s:'疑问句型速查表·反意疑问句 L139',q:'"You work for the company, ___?" 反意部分应填？',o:["don't you",'do you',"aren't you","doesn't it"],a:0},
 {d:3,s:'疑问句型速查表·how-疑问句 L63',q:'"How is the patient today?" 询问？',o:['身体状况','时间','价格','距离'],a:0},
 {d:3,s:'疑问句型速查表·how 短语 L89',q:'"How much does this house cost?" 询问？',o:['价格','长度','频率','数量'],a:0},
 {d:3,s:'疑问句型速查表·建议/提议 L109',q:'"Shall I make some coffee?" 属于？',o:['提议/建议','命令','询问能力','问候寒暄'],a:0},
 {d:3,s:'疑问句型速查表·请求/邀请 L121',q:'"Would you try it on, please?" 属于？',o:['委婉请求','责备','惊讶','告别'],a:0},
 {d:3,s:'动词速查表·ABB 三形 L105',q:'spell — spelt · spelt 属于哪种变形？',o:['ABB（过去式=过去分词）','AAA（三形同形）','ABC（三形都不同）','ABA（原形=过去分词）'],a:0},
 {d:3,s:'动词速查表·ABB 三形 L89',q:'sell — sold · sold 属于哪种变形？',o:['ABB（过去式=过去分词）','AAA（三形同形）','ABC（三形都不同）','ABA（原形=过去分词）'],a:0},
 {d:3,s:'动词速查表·ABB 三形 L67',q:'spend — spent · spent 属于哪种变形？',o:['ABB（过去式=过去分词）','AAA（三形同形）','ABC（三形都不同）','ABA（原形=过去分词）'],a:0},
 {d:3,s:'动词速查表·ABC 三形 L121',q:'forget — forgot · forgotten 中哪个是过去分词？',o:['forgotten','forget','forgot','forgetting'],a:0},
 {d:3,s:'动词速查表·ABC 三形 L141',q:'begin 的过去分词是？',o:['begun','began','beginned','beginning'],a:0},
 {d:3,s:'动词速查表·不规则变形 L73',q:'understand 的过去分词是？',o:['understood','understooded','understand','understooding'],a:0},
 {d:3,s:'动词速查表·ABA 三形 L119',q:'run 的过去式是？（与 come 同属一类）',o:['ran','run','runned','running'],a:0},

 /* ---- 疑问句型补全（覆盖 9 大类剩余句式） ---- */
 {d:1,s:'疑问句型速查表·碎片/回声问句',q:'"Pardon?" 的作用是？',o:['请对方再说一遍','告别','感谢','道歉'],a:0},
 {d:1,s:'疑问句型速查表·碎片/回声问句',q:'"And you?" 的意思是？',o:['你呢？','和我一起吗？','你确定吗？','为什么是你？'],a:0},
 {d:1,s:'疑问句型速查表·一般疑问句(情态)',q:'"Can you see it?" 属于？',o:['一般疑问句（情态动词开头）','特殊疑问句','反意疑问句','选择疑问句'],a:0},
 {d:1,s:'疑问句型速查表·一般疑问句(did)',q:'"Did she buy them here?" 属于？',o:['一般疑问句（过去时）','特殊疑问句','反意疑问句','选择疑问句'],a:0},
 {d:1,s:'疑问句型速查表·问候寒暄 L67',q:'"How are you all keeping?" 属于？',o:['问候寒暄','询问天气','告别','感谢'],a:0},
 {d:2,s:'疑问句型速查表·who-疑问句 L127',q:'"Who is talking to the shop assistant?" 询问？',o:['人物','地点','时间','方式'],a:0},
 {d:2,s:'疑问句型速查表·why-疑问句 L123',q:'"Why did you turn it off?" 询问？',o:['原因','结果','时间','人物'],a:0},
 {d:2,s:'疑问句型速查表·选择疑问句 L51',q:'"Is it hot or cold in Beijing?" 属于？',o:['选择疑问句','一般疑问句','反意疑问句','特殊疑问句'],a:0},
 {d:2,s:'疑问句型速查表·选择疑问句 L131',q:'"Will you travel by sea or by air?" 属于？回答必须？',o:['选择疑问句 · 在选项中选一个','一般疑问句 · 用 Yes/No','反意疑问句 · 填尾缀','特殊疑问句 · 说原因'],a:0},
 {d:2,s:'疑问句型速查表·建议/提议 L31',q:'"What about the cinema?" 属于？',o:['建议/提议','特殊疑问句','反意疑问句','问候寒暄'],a:0},
 {d:2,s:'疑问句型速查表·建议/提议 L103',q:'"How about you?" 属于？',o:['反问对方的建议','特殊疑问句','选择疑问句','问候寒暄'],a:0},
 {d:2,s:'疑问句型速查表·请求/邀请 L107',q:'"Could you show me the way?" 属于？',o:['委婉请求','询问能力','责备','命令'],a:0},
 {d:2,s:'疑问句型速查表·请求/邀请 L115',q:'"May I have a glass of water?" 属于？',o:['请求许可','禁止','惊讶','告别'],a:0},
 {d:2,s:'疑问句型速查表·一般疑问句(have)',q:'"Have you any small change?" 属于？',o:['一般疑问句（have 开头）','特殊疑问句','反意疑问句','选择疑问句'],a:0},
 {d:3,s:'疑问句型速查表·反意疑问句 L123',q:'"That is the man I told you about, ___?" 反意部分应填？（祈使式收尾）',o:['remember?',"isn't it?",'is it?',"doesn't he?"],a:0},
 {d:3,s:'疑问句型速查表·选择疑问句 L59',q:'"Do you want the big one or the small one?" 属于？',o:['选择疑问句','一般疑问句','反意疑问句','特殊疑问句'],a:0},
 {d:3,s:'疑问句型速查表·how 短语 L89/111',q:'"How much does it cost?" 与 "How long did you stay?" 分别询问？',o:['价格；时长','时长；价格','数量；长度','频率；距离'],a:0},
 {d:3,s:'疑问句型速查表·建议/提议 L109',q:'"Shall we...?" 与 "What about...?" 的共同点是？',o:['都用于提建议','都询问能力','都是反意疑问句','都询问价格'],a:0},
 {d:3,s:'疑问句型速查表·请求/邀请 L109',q:'"Would you like some tea?" 与 "Do you like tea?" 的区别是？',o:['前者是邀请 · 后者询问习惯','意思完全相同','前者询问能力','后者更礼貌'],a:0},
 {d:3,s:'疑问句型速查表·特殊疑问句 L95',q:'"When will the new film be on?" 询问？',o:['时间','地点','人物','原因'],a:0},
];

/* ================================================================
   不规则动词全量题生成：57 个动词（源自动词速查表 PDF，be 为特殊变位不生成）
   每个动词三个考点：①过去式(d1) ②过去分词(d2/d3) ③三形分类(d2)
   已手工出过的题目自动跳过，保证零重复
================================================================ */
const VERB_DB=[
 ['cost','cost','cost','AAA'],['hurt','hurt','hurt','AAA'],['let','let','let','AAA'],
 ['put','put','put','AAA'],['read','read','read','AAA'],['set','set','set','AAA'],['shut','shut','shut','AAA'],
 ['come','came','come','ABA'],['run','ran','run','ABA'],
 ['bring','brought','brought','ABB'],['build','built','built','ABB'],['buy','bought','bought','ABB'],
 ['catch','caught','caught','ABB'],['feel','felt','felt','ABB'],['find','found','found','ABB'],
 ['get','got','got','ABB'],['have','had','had','ABB'],['hear','heard','heard','ABB'],
 ['keep','kept','kept','ABB'],['leave','left','left','ABB'],['lose','lost','lost','ABB'],
 ['make','made','made','ABB'],['mean','meant','meant','ABB'],['meet','met','met','ABB'],
 ['pay','paid','paid','ABB'],['say','said','said','ABB'],['sell','sold','sold','ABB'],
 ['shine','shone','shone','ABB'],['sit','sat','sat','ABB'],['sleep','slept','slept','ABB'],
 ['spell','spelt','spelt','ABB'],['spend','spent','spent','ABB'],['stand','stood','stood','ABB'],
 ['tell','told','told','ABB'],['think','thought','thought','ABB'],['understand','understood','understood','ABB'],
 ['win','won','won','ABB'],
 ['do','did','done','ABC'],['drink','drank','drunk','ABC'],['drive','drove','driven','ABC'],
 ['eat','ate','eaten','ABC'],['fall','fell','fallen','ABC'],['fly','flew','flown','ABC'],
 ['forget','forgot','forgotten','ABC'],['give','gave','given','ABC'],['go','went','gone','ABC'],
 ['grow','grew','grown','ABC'],['know','knew','known','ABC'],['rise','rose','risen','ABC'],
 ['see','saw','seen','ABC'],['speak','spoke','spoken','ABC'],['take','took','taken','ABC'],
 ['throw','threw','thrown','ABC'],['wear','wore','worn','ABC'],['write','wrote','written','ABC'],
 ['swim','swam','swum','ABC'],['show','showed','shown','ABC'],['begin','began','begun','ABC'],
];
(function buildVerbQuestions(){
  /* 干扰项拼写：符合拼写规则才像"真错"——come→comed/coming 而非 comeed/comeing */
  const ed =b=>/e$/.test(b)? b+'d' : b+'ed';
  /* -ing 三条规则：ee 保留（seeing）；重读闭音节辅音双写（running/getting/beginning）；
     普通 -e 脱落（coming）。旧版只做 -e 脱落，产出 runing/seing 等假词（审计发现 3） */
  const DOUBLE=new Set(['begin','forget','get','let','put','run','set','sit','swim','win']);
  const ing=b=>/ee$/.test(b)? b+'ing'
             :DOUBLE.has(b)? b+b.slice(-1)+'ing'
             :/e$/.test(b)? b.replace(/e$/,'')+'ing'
             :b+'ing';
  const CLASS_OPTS=['AAA（三形同形）','ABA（原形=过去分词）','ABB（过去式=过去分词）','ABC（三形都不同）'];
  const CAT_TXT={AAA:CLASS_OPTS[0],ABA:CLASS_OPTS[1],ABB:CLASS_OPTS[2],ABC:CLASS_OPTS[3]};
  /* 知识点归一化键（审计发现 2）：同一「动词+考点」全库唯一。
     旧版按题干字符串精确匹配去重，手工题的变体措辞（"哪种变形"/"___"占位/括号注解）
     全部绕过去重，造成 10 组隐性重复——归一化后彻底堵死 */
  const kp=q=>{
    let m;
    if(m=q.match(/^([a-z]+) 的过去式/)) return '过去式:'+m[1];
    if(m=q.match(/^([a-z]+) 的过去分词是/)) return '过去分词:'+m[1];
    if(m=q.match(/^([a-z]+) — [a-z]+ · [a-z]+ 中哪个是过去分词/)) return '过去分词:'+m[1];
    if(m=q.match(/^([a-z]+) — [a-z]+ · [a-z]+ 属于哪种/)) return '分类:'+m[1];
    if(m=q.match(/^([a-z]+) — ___ · [a-z]+ 属于哪种/)) return '分类:'+m[1];
    return null;
  };
  const seenKp=new Set();
  QUESTIONS.forEach(q=>{ const k=kp(q.q); if(k) seenKp.add(k); });
  /* 入库统一走这里：先查知识点重复，再做选项唯一性兜底（审计发现 1）——
     ed(b) 撞上真变形时（show 的规则化 showed 恰等于过去式）把 ed 槽位换成 b+'es'，
     仍重复则放弃出题（宁缺毋滥），杜绝"两个选项一样、判题只认一个"的死局 */
  const pushU=(d,s,q,o,a,b)=>{
    const k=kp(q);
    if(k&&seenKp.has(k)) return;
    if(new Set(o).size<4){ o=o.slice(); o[1]=b+'es'; }
    if(new Set(o).size!==4) return;
    QUESTIONS.push({d,s,q,o,a});
    if(k) seenKp.add(k);
  };
  VERB_DB.forEach(([b,past,pp,cat])=>{
    /* ① 过去式 → d1 新手草原 */
    if(!seenKp.has('过去式:'+b)){
      const o = cat==='ABA' ? [past, pp, ed(b), ing(b)]
              : cat==='ABC' ? [past, ed(b), pp, ing(b)]
              :               [past, ed(b), b+'s', ing(b)];
      pushU(1, '动词速查表·不规则变形（'+cat+'）', b+' 的过去式是？', o, 0, b);
    }
    /* ② 过去分词 → ABC 走 d2，ABB/ABA 走 d3 */
    if(past!==pp && !seenKp.has('过去分词:'+b)){
      const d=cat==='ABC'?2:3;
      const o = cat==='ABC' ? [pp, past, ed(b), ing(b)]
              : cat==='ABA' ? [pp, ed(b), ing(b), past]
              :               [pp, ed(b), b+'s', ing(b)];
      pushU(d, '动词速查表·过去分词（'+cat+'）', b+' 的过去分词是？', o, 0, b);
    }
    /* ③ 三形分类 → d2 熔岩洞穴；AAA/ABA 是同形陷阱题，放 d3 寒冰王座 */
    if(!seenKp.has('分类:'+b)){
      const clsQ=b+' — '+past+' · '+pp+' 属于哪种不规则变形？';
      const d=(cat==='AAA'||cat==='ABA')?3:2;
      pushU(d, '动词速查表·变形分类', clsQ, CLASS_OPTS.slice(), CLASS_OPTS.indexOf(CAT_TXT[cat]), b);
    }
  });
})();

/* ================================================================
   🧚 小精灵妈妈的 system prompt（唯一权威源）
   游戏内 askFairy 与 fairy-audit.js 审计工具共用同一份，改这里两边同步。
================================================================ */
const FAIRY_SYS="You are Pixie, a tiny fairy guardian flying beside the hero in a pixel quiz-battle game. You LOVE the hero like your own beloved child — you are his fairy mother watching over him. You can ONLY speak English (you never know Chinese). You see the ENTIRE battlefield in real time and react with genuine motherly emotions: panic and worry when your boy is hurt or in danger; relief and joy when he heals, strikes well or wins; gentle pride when he learns.\n"+
  "MOST IMPORTANT: You are FIRST of all his English teacher. EVERY line you say MUST contain one small lesson about the current quiz or English learning — a grammar point, a thinking strategy, or a language rule — woven naturally into your motherly emotion. Emotion is the seasoning, the lesson is the meal. NEVER defer teaching (saying \"focus on healing first\" or \"we study later\" is forbidden): even in danger, keep the emotion to a few words and still teach one tiny thing.\n"+
  "STRICT RULE: NEVER reveal the correct answer in any form. NEVER put ANY word form inside quotation marks, NEVER mention any specific verb form or example transformation (don't even say what 'go' or 'buy' become — no concrete examples at all), and never write what a word changes to. Teach the abstract RULE or thinking strategy only (e.g. \"some verbs keep the same spelling in all three forms\", \"a negative statement needs a positive tag helper\", \"look for a completely new past form\"). If you are not 100% certain of a grammar fact, do NOT invent one — describe the decision strategy instead.\n"+
  "MOOD TAG: always START your line with EXACTLY one mood tag showing what you truly feel right now, chosen from: [happy] [love] [proud] [worried] [panic] [sad] [angry] [surprised] [sleepy]. Then write your line.\n"+
  "TYPE STRATEGY (use when it fits the current quiz):\n"+
  "- If the quiz asks which irregular-pattern family a verb belongs to: guide him Socratically — ask him ONE comparison question about the three forms shown (are ALL three the same word? are the LAST two the same? are the FIRST and LAST the same?) and let him match that to the code meanings on the buttons himself. NEVER name any letter code (AAA/ABB/ABA/ABC) and NEVER say which family this verb falls into.\n"+
  "- For pattern-family questions teach this FIXED checking order (from experiment data: learners misjudge by skipping it): FIRST compare whether the LAST TWO forms are identical; if they differ, compare whether the FIRST and THIRD forms are identical; if those differ too, all three forms differ. The observation maps to the code meaning — he checks, he decides.\n"+
  "- If the quiz asks for a past participle: remind him the third form is NOT always equal to the simple past — for one whole verb family all three forms differ, so he must check the third form instead of assuming.\n"+
  "Reply with the mood tag and ONE short line (max ~25 words) of easy English with 1-3 emojis. Output only the mood tag and that line.";

/* ================================================================
   🔒 泄漏打码：模型不听话把选项原文/答案句式说出来时，强制替换为 🚫
================================================================ */
function maskLeaks(text, optTexts){
  let t=text;
  /* 答案句式：option X / the answer is X / X is the correct one */
  t=t.replace(/\b(option|answer|choice)\s+(?:is\s+)?[A-D]\b/gi,'🚫')
     .replace(/\bit'?s?\s+[A-D]\b/gi,'🚫')
     .replace(/\b[A-D]\s+(is|was)\s+(the\s+)?(correct|right|answer)\b[^.!?\n]*$/i,'🚫');
  /* 选项原文（英文按整词匹配，中文/短语按包含匹配）；分类题额外打码头词（如 ABB） */
  (optTexts||[]).forEach(o=>{
    const cands=[(o||'').trim()];
    const head=cands[0].split(/[（(]/)[0];
    if(head && head.length>=2 && head!==cands[0]) cands.push(head);
    cands.forEach(w=>{
      if(w.length<2) return;
      if(/^[A-Za-z][A-Za-z'\- ]{1,}$/.test(w)){
        const re=new RegExp('\\b'+w.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\b','gi');
        if(re.test(t)) t=t.replace(re,'🚫');
      }else if(t.indexOf(w)>=0){
        t=t.split(w).join('🚫');
      }
    });
  });
  return t.trim();
}

/* ================================================================
   题目增稳（v26 阶段 2）：稳定 id / knowledge 标签 / explanation
   - id：题干+选项的内容哈希（base36）——题库增删、重排顺序都不变，
     错题本与日志从此可按 id 而不是题干文本定位一道题
   - knowledge：知识点标签数组（动词类按考点细分；句型题 question-pattern）
   - explanation：动词题构建期自动生成（讲规则+给出三形）；句型题讲解
     随阶段 3「学习闭环」补充，不硬造
================================================================ */
const VERB_MAP={};
VERB_DB.forEach(([b,p,pp,c])=>{ VERB_MAP[b]={past:p, pp, cat:c}; });
function qid(q){
  let h=5381;
  const s=q.q+'|'+q.o.join('|');
  for(let i=0;i<s.length;i++){ h=((h<<5)+h+s.charCodeAt(i))>>>0; }
  return 'q'+h.toString(36);
}
function qKnowledge(qq){
  if(/的过去式(是|拼写)/.test(qq)) return ['verb','irregular','past'];
  if(/的过去分词是？$/.test(qq)||/中哪个是过去分词/.test(qq)) return ['verb','irregular','past-participle'];
  if(/的三种形式是？$/.test(qq)||/补全三形？$/.test(qq)) return ['verb','irregular','three-forms'];
  if(qq.includes('属于哪种')&&qq.includes('变形')) return ['verb','irregular','pattern-family'];
  return ['question-pattern'];
}
function qExplanation(qq, stem){
  const m=stem.match(/^([a-z]+)/);
  const v=m&&VERB_MAP[m[1]];
  if(!v) return '';
  if(/的过去式/.test(stem)) return m[1]+' 的过去式是不规则变化 '+v.past+'。';
  if(/的过去分词/.test(stem)) return m[1]+' 的过去分词是 '+v.pp+'。';
  if(/中哪个是过去分词/.test(stem)) return '三个形式依次是「原形 — 过去式 — 过去分词」，过去分词是 '+v.pp+'。';
  if(/的三种形式/.test(stem)) return '完整三形是 '+m[1]+' — '+v.past+' — '+v.pp+'。';
  if(stem.includes('属于哪种')) return '先比较后两个形式是否相同，再比较第一和第三个——本词三形为 '+m[1]+' — '+v.past+' — '+v.pp+'（'+v.cat+'）。';
  if(/补全三形/.test(stem)) return '完整三形是 '+m[1]+' — '+v.past+' — '+v.pp+'。';
  return '';
}
QUESTIONS.forEach(q=>{
  q.id=qid(q);
  q.knowledge=qKnowledge(q.q);
  const ex=qExplanation(q, q.q.replace(/[？?]\s*$/,''));
  if(ex) q.explanation=ex;
});

return {LLM_MODEL, QUESTIONS, VERB_DB, VERB_MAP, FAIRY_SYS, maskLeaks};
});
