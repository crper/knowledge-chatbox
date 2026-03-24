# TODOS

## Form Status Visual QA

- What: 实现完成后，补一轮表单状态视觉 QA，覆盖 mobile / dark / en 三个高风险维度。
- Why: 这轮设计审查已经补齐错误展示、响应式、主题和国际化要求，但最容易在实现后回归的，正是小屏换行、深色对比和英文长文案。
- Pros: 能提前拦住错误信息挤坏布局、深色模式可读性不足、英文文案撑坏按钮和状态区。
- Cons: 需要多一轮验收时间。
- Context: 重点核查登录、改密、创建用户、重置密码、系统提示词、Provider 设置这 6 类表单的加载、失败、成功、部分成功状态。
- Depends on / blocked by: 先完成本轮表单校验实现。

## Provider First-Error Scroll Regression

- What: 第二段实现 `provider-form` 时，补“提交失败后滚动到第一个出错字段”的回归测试。
- Why: 这是长表单里最容易在后续改字段顺序、折叠区或错误结构时悄悄失效的用户契约。
- Pros: 能锁住错误顺序、字段定位和折叠区展开后的真实纠错路径。
- Cons: 这类交互测试比普通纯函数测试更脆一点。
- Context: 当前计划已经明确要求 `provider-form` 提交失败后滚动到第一个错误字段，但仓库里还没有专门覆盖这类行为的测试。
- Depends on / blocked by: 第二段 `provider-form` 结构化校验结果先落地。
