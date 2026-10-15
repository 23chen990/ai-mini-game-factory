// Brand the static page BEFORE the heavyweight 3D module runs.
// Do not let the original authorized PC demo's help screen flash first.
const once=(text,a,b)=>{
 if(text.split(a).length!==2)throw Error('Pinned original H5 boot anchor changed');
 return text.replace(a,b);
};
export function brandPelicanBoot(html){
 let s=once(html,'<title>鹈鹕骑单车 · Pelican on a Bike</title>',
  '<title>鹈鹕海岸冒险 · 自由骑行</title>');
 s=once(s,'<meta property="og:title" content="鹈鹕骑单车 · Pelican on a Bike" />',
  '<meta property="og:title" content="鹈鹕海岸冒险 · 自由骑行" />');
 s=once(s,'</head>',`<style id="coast-boot-style">
 #intro,.hud,#guiHost,#help{display:none!important}
 #coast-boot{position:fixed;inset:0;z-index:80;display:grid;place-items:center;
  background:radial-gradient(ellipse at 50% 30%,#f1d6a3 0%,#78b9b6 50%,#194f69 100%);
  color:#193e4a;font:700 16px/1.5 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif}
 #coast-boot>div{padding:18px 24px;text-align:center;background:#fff8e9f0;
  border:2px solid #ffefcc;border-radius:24px;box-shadow:0 15px 55px #143f4c44}
 #coast-boot strong{display:block;font-size:clamp(24px,6vw,33px)}
 #coast-boot small{display:block;color:#4c7578;margin-top:6px;letter-spacing:.05em}
 body:has(#fallback:not([hidden])) #coast-boot{display:none}
 </style></head>`);
 s=once(s,'<body class="bars">',
  '<body class="bars"><div id="coast-boot" role="status" aria-label="鹈鹕海岸冒险正在加载"><div><strong>🐦 🚲 鹈鹕海岸冒险</strong><small>海岸正在准备 · 马上出发</small></div></div>');
 return s;
}
