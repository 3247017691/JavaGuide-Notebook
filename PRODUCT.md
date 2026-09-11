# PRODUCT.md — JavaGuide 学习报告册

## Platform
web（本地 Node.js + Express + MySQL，http://localhost:3000）

## Users
备 Java 后端面试的计算机专业学生本人；桌面为主（学习时开 IDE + 浏览器），手机看进度为次要场景。

## Product Purpose
把 javaguide.cn 的 12 章 332 篇知识体系变成可跟踪的阅读任务：读完一篇即在目录上划一条朱线，首页像成绩报告册一样实时汇总各科完成率与总评。成功 = 每天打开看一眼就知道还剩多少没读。

## Operating Context
- 单机自用，无账号体系；数据只存本机 MySQL（root/123456，库 javaguide_report）。
- 阅读发生在 javaguide.cn 原站，本站只做目录 + 状态记录（明细页每篇带原文跳转）。
- 目录数据源自 JavaGuide 官方仓库侧边栏配置，落为 data/chapters.json，可再生。

## Capabilities and Constraints
- 已读划线 / 撤线（单篇、整科批量）；实时统计（首页 15s 轮询）。
- 离线无外部字体/CDN；视觉世界 = 学生成绩报告册（浅青灰格纸、蓝黑印刷、朱砂红笔迹、楷体批语、骑缝章）。
- 内容事实不可变：章名、篇名、URL 与 JavaGuide 目录一致，不得杜撰篇目。

## Brand Commitments
无外部品牌约束；报告册隐喻由用户确认的方向契约锁定（seed 672c0b56）。

## Evidence on Hand
- data/chapters.json（332 篇真实目录，0 缺标题）。
- .impeccable/surfaces/public-index-html.md（方向契约）。

## Product Principles
1. 跳转与划线分开：点条目 = 直接翻页/开原文，点右侧按钮才划线（朱线划过 + 落章）。
2. 进度是仪表盘：首页任何数字都必须与库中状态实时一致。
3. 报告册不说谎：成绩等级只由完成率换算，不掺假数据。
