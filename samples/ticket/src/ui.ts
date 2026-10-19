// Kept as TypeScript text so isolated project copies include all UI resources.
export const samplePage=`<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>工单工作台 · 鉴实样例</title>
<link rel="stylesheet" href="/ui/style.css">
<script src="/ui/app.js" defer>
</script>
</head>
<body data-kind="ticket">
<header>
<div class="brand">工单工作台 <span class="badge">本机测试样例</span>
</div>
<div id="session" class="session" hidden>
<span id="signed-in">
</span>
<button id="logout" type="button">退出登录</button>
</div>
</header>
<main>
<section class="hero">
<h1>提交问题、查看自己的工单、修改标题</h1>
<p class="muted">真实接口 + 独立合成数据库。操作成功不等同于 鉴实 正式验证通过。</p>
</section>
<div id="message" class="notice" role="status" aria-live="polite">请使用演示启动终端显示的测试账号登录。不要输入真实账号密码。</div>
<section id="login-area" class="grid">
<div class="card">
<h2>登录测试账号</h2>
<form id="login-form">
<fieldset>
<label>账号<input id="username" name="username" value="demo-owner" autocomplete="username" required>
</label>
<label>密码<input id="password" name="password" type="password" autocomplete="off" required>
</label>
<button class="primary" type="submit">登录</button>
</fieldset>
</form>
<p class="hint">在样例目录执行 npm run demo，终端会给出本次临时账号和访问地址。</p>
</div>
<aside class="card">
<h2>可以体验什么</h2>
<ol class="checklist">
<li>创建记录，并查询真实保存结果</li>
<li>重复提交同一意图，核对是否重复创建</li>
<li>仅修改标题时，优先级和归属保持不变。</li>
<li>退出后换另一个账号，核对是否能看到他人的记录</li>
</ol>
<p class="hint">仅用于本机开发演示，不包含生产注册、找回密码或支付功能。</p>
</aside>
</section>
<section id="workspace" class="grid" hidden>
<div class="card">
<h2>提交一条工单</h2>
<form id="create-form">
<fieldset>
<label>工单标题<input id="title" required maxlength="160" placeholder="请输入合成测试内容">
</label>
<div class="actions">
<button type="submit" class="primary">提交</button>
<button type="button" id="new-intent">新的提交</button>
</div>
</fieldset>
</form>
<p class="hint">重复点击提交会沿用同一意图。新记录请先点“新的提交”。</p>
<details>
<summary>高级：演示批次与去重标识</summary>
<form id="scope-form">
<fieldset>
<label>演示批次<input id="attempt" required maxlength="128">
</label>
<button type="submit">切换批次</button>
</fieldset>
</form>
<label>当前提交意图<input id="intent" readonly>
</label>
<p class="hint">列表仅显示当前账号和批次的数据。刷新保留批次；不保存密码或登录令牌。</p>
</details>
</div>
<div class="card">
<div class="section-head">
<div>
<h2>我的工单</h2>
<span id="count" class="muted">0 条</span>
</div>
<button id="refresh" type="button">刷新列表</button>
</div>
<div id="records" class="records">
</div>
</div>
</section>
</main>
<footer>鉴实 · ticket · 本页面不会调用 AI。界面只操作当前样例，不读取其他项目目录。</footer>
</body>
</html>`;

export const sampleStyles=`*{box-sizing:border-box}
body{margin:0;background:#f3f6fb;color:#17243a;font:15px/1.6 system-ui,"Microsoft YaHei",sans-serif}
button,input{font:inherit}
button{cursor:pointer;border:1px solid #cbd5e1;border-radius:9px;padding:9px 15px;background:white;color:#17243a}
button:hover{background:#eaf0fa}
button.primary{background:#245cce;color:white;border-color:#245cce}
button:disabled{opacity:.5;cursor:wait}
input{width:100%;padding:10px 12px;border:1px solid #b9c7db;border-radius:8px;background:white;color:#17243a}
input:focus,button:focus-visible,summary:focus-visible{outline:3px solid #83afff;outline-offset:2px}
label{display:grid;gap:5px;margin:12px 0;font-weight:600}
fieldset{border:0;padding:0;margin:0;min-width:0}
header{background:white;border-bottom:1px solid #dfe6f0;padding:18px max(24px,calc((100vw - 1120px)/2));display:flex;justify-content:space-between;align-items:center;gap:15px}
.brand{font-weight:750;font-size:19px}
.badge{font-size:12px;background:#e9f0ff;color:#245cce;padding:5px 10px;border-radius:30px}
main{max-width:1120px;margin:30px auto;padding:0 24px}
.hero{margin-bottom:22px}
.hero h1{font-size:30px;margin:0 0 8px;letter-spacing:-.5px}
.muted,.hint{color:#52637d}
.hint{font-size:13px}
.grid{display:grid;grid-template-columns:320px 1fr;gap:22px;align-items:start}
.card{background:white;border:1px solid #dde5f0;border-radius:14px;padding:24px;box-shadow:0 3px 12px #1d376008}
.card h2{font-size:19px;margin:0 0 12px}
.actions{display:flex;gap:9px;align-items:center;flex-wrap:wrap}
.section-head{display:flex;justify-content:space-between;gap:12px;align-items:center}
.notice{padding:12px 15px;border:1px solid #cad9ed;border-radius:10px;background:#eef4ff;margin-bottom:20px;overflow-wrap:anywhere}
.notice[data-error="true"]{background:#fff1f0;border-color:#efb3ac;color:#8e2820}
.records{display:grid;gap:12px;margin-top:18px}
.record{border:1px solid #dae3ef;border-radius:10px;padding:17px;overflow-wrap:anywhere}
.record h3{margin:0 0 5px;font-size:17px}
.record small{display:block;color:#52637d;font-size:12px}
.record form{margin-top:12px}
.record form label{font-size:13px}
.pill{display:inline-block;padding:2px 9px;border-radius:20px;background:#edf3ff;color:#245cce;font-size:12px}
.empty{text-align:center;padding:36px 16px;color:#52637d;border:1px dashed #cbd5e1;border-radius:10px}
details{margin-top:20px;border-top:1px solid #e2e8f0;padding-top:15px}
summary{cursor:pointer;color:#344f76}
.session{display:flex;align-items:center;gap:12px}
.checklist{padding-left:19px}
.checklist li{margin:8px 0}
footer{max-width:1120px;margin:28px auto;padding:0 24px;color:#617087;font-size:12px}
[hidden]{display:none!important}
@media(max-width:760px){.grid{grid-template-columns:1fr}
header{padding:14px 20px;align-items:flex-start}
.hero h1{font-size:25px}
.card{padding:20px}
main{padding:0 16px;margin:22px auto}
.session{flex-wrap:wrap}
.section-head{align-items:flex-start}
}
`;
