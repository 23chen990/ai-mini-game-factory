# 输入输出与命令

要求 Node 22+。技能脚本无第三方依赖、无网络、无写文件、无模型或安装调用。所有数据路径均相对于显式ROOT，禁止越界和符号链接，单文件上限1MiB。

```sh
node scripts/workflow.mjs plan ROOT request.json
node scripts/workflow.mjs draft ROOT request.json
node scripts/workflow.mjs check ROOT request.json contract.json
```

命令输出标准JSON；0=合法工作单/草稿/规格检查，2=明确BLOCKED，1=输入错误。成功输出不等于获准花钱、执行、安装、合并或发布。日志不打印私有错误路径。重定向保存由操作者负责，请用新文件名避免覆盖历史记录。

## Request v1（精确字段）

schemaVersion=1；gameId=小写字母数字连字符；profile为ACTION_FEEL/STRATEGIC_SYSTEM/NARRATIVE_AGENCY/PUZZLE_CLARITY之一，无法判断时null；secondaryProfile=null或不同的一个类型；mode=discover/variant/repair；platform=web-lite/wechat/douyin/taptap；progression=session/persistent。

changedAreas为theme/content/levels/controls/core-rules/economy/progression/storage/platform的去重数组。template=null，或{id,revision,qualification:{path,sha256}}，revision必须完整Git SHA。repair=null，或{targetState,actual,expected,evidence:{path,sha256}}。预算budget={maxCashCents,maxWorkMinutes,maxFixAttempts}，非负整数，工作分钟>0，修复最多5轮（建议2轮，初始构建不算修复）。预算在此仅传递给执行者，不接管外部账单。

```json
{"schemaVersion":1,"gameId":"hospital-loop","profile":"STRATEGIC_SYSTEM","secondaryProfile":null,"mode":"discover","platform":"web-lite","progression":"persistent","changedAreas":["core-rules"],"template":null,"repair":null,"budget":{"maxCashCents":0,"maxWorkMinutes":240,"maxFixAttempts":2}}
```

所有work order带requestHash和策略代码/配置的policyHash，未知profile阻止派工；variant没有匹配复用凭证或改了核心/经济/控制/存档/平台，回到discover，不偷换成闲置母版。修复没证据则BLOCKED。最多一个次类型，额外要求hybrid-link用例，不把全部专用流程叠起来。

## Contract v1

用draft生成精确结构，填完改status为PROPOSED。requestHash与policyHash由脚本提供，需求改变后必须重新审核，不能手填假哈希。

firstSession：firstAction/firstResult/nextIntention/safeStop。
loops：1—3项，恰好一个scale=core，其余可为goal/meta；每项id/scale/decision/action/visibleChange/nextIntention/variation/claim/evidenceRefs。claim=hypothesis/observed/source-derived。hypothesis允许做有上限的原型实验，不得记成观察结果。
links：from/to/kind/effect，kind=feeds或changes-action。添加上层循环时，核心必须能向它提供产出，它也必须有回到核心的行动影响路径。单局允许只有core，避免硬加元成长。
progression：session用null并填endingValue；persistent用{savedState,effectOnNextCore,safeExit}。
cases：每项id/tag/given/when/thenState/thenVisible/contrastAction/contrastExpected/evidenceRefs，tag覆盖profiles.json的主/次类型标签及first-action-feedback、safe-exit-or-recovery。脚本只查字段/反例差异，不验证自然语言推理真假。
evidence：每项id/targetId/version/kind/file/locator；kind=observation/source/creator-post；file={path,sha256}。观察不能引用帖子或源码冒充。报告只统计核对的文件数量，哈希不能证明语义真实性。
openQuestions：问题数组。measurements的enjoyment/voluntaryContinuation/nextDayReturn/retrospectiveValue均保留NOT_RUN；真人结果独立存放，不能把规格当体验报告。

通过只意味着SPEC_READY_FOR_PROTOTYPE_REVIEW；仍executionAllowed=false、releaseAllowed=false，无“好玩分”。

## 复用凭证（必须独立审核，不由本Skill自动颁发）

模板qualification为schemaVersion/policyHash/templateId/revision/profile/secondaryProfile/platform/progression/buildHash/runId/decision/reviewer/allowedChanges/reports。decision=APPROVE_BOUNDED_VARIANTS，allowedChanges最多theme/content/levels。reports精确包含engineering/browser/human的文件引用。

三个报告必须passed=true、runId/buildHash一致。browser还需scope=HTTP_BROWSER、非空全通过checks和实际artifacts文件引用。human还需profile/source=HUMAN/reviewer/decision=APPROVE_BOUNDED_VARIANTS及至少3条已同意、未经指导的独立sessions；每条id/consent/uncoached/finding/evidence。数量仅防止空凭证，不能推断人群留存；审核人需判断类型相关体验，不能靠计数自动发证。

此格式为本工作单的独立复用评审收据，不是旧factory certification或旧human-review.json的替代物。不能把旧合并游戏firstMergeMs测试复制成剧情验收。核验声明和文件一致性不等于数字签名或真实人类身份验证，仍需独立审核与受控存储。当前仓库没有因此自动成为成熟的母版。

## 已实现的仓库执行桥

`tools/lean-pilot/build-workflow.mjs` 调用本Skill同一份plan/audit实现，核对已实现合同，再交原runner创建独立run。不是把任意合同送给旧Zod，也不是通用AI编译器。当前新配方仅为中文门诊3分钟实验；动作/剧情类型仍需各自真实代码。合同、测试、预算、证据与当前构建绑定，结构通过不能替代实际运行结果。

## Mobile/active extension

New prototypes declare optional request.experience as defined in mobile-pacing.md. This enables typed checkpoints and additional counterexample tags. Legacy frozen v1 inputs remain readable, explicitly labeled as lacking this contract. The clinic builder requires the extension; a structure-only pass never closes a user-reported experience failure.
