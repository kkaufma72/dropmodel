import { prisma } from "@/lib/db";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      name: true,
      status: true,
      customization: true,
    },
  });

  if (!project) {
    return new Response("// Project not found", {
      status: 404,
      headers: { "Content-Type": "application/javascript; charset=utf-8" },
    });
  }

  const custom = project.customization as Record<string, unknown>;
  const accentColor = (custom.chatbotColor as string) || "#6366f1";
  const welcomeMessage =
    (custom.welcomeMessage as string) || "Hi! How can I help?";

  const script = generateEmbedScript(projectId, accentColor, welcomeMessage);

  return new Response(script, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

function generateEmbedScript(
  projectId: string,
  accentColor: string,
  welcomeMessage: string,
): string {
  // Escape for safe embedding in JS string literals
  const safeColor = accentColor.replace(/[^#a-fA-F0-9]/g, "");
  const safeWelcome = welcomeMessage
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n");

  // Self-contained embed script — no external dependencies, < 5KB
  return `(function(){
"use strict";
if(window.__dropmodel_loaded)return;
window.__dropmodel_loaded=true;

var PID="${projectId}";
var COLOR="${safeColor}";
var WELCOME="${safeWelcome}";
var ORIGIN=document.currentScript&&document.currentScript.src?new URL(document.currentScript.src).origin:window.location.origin;
var CHAT_URL=ORIGIN+"/embed/"+PID+"/chat";
var isOpen=false;

var s=document.createElement("style");
s.textContent=
"#dm-btn{position:fixed;bottom:20px;right:20px;z-index:2147483646;"+
"width:60px;height:60px;border-radius:50%;border:none;cursor:pointer;"+
"background:"+COLOR+";color:#fff;"+
"box-shadow:0 4px 14px rgba(0,0,0,.15);"+
"display:flex;align-items:center;justify-content:center;"+
"transition:transform .2s,box-shadow .2s}"+
"#dm-btn:hover{transform:scale(1.05);box-shadow:0 6px 20px rgba(0,0,0,.2)}"+
"#dm-btn svg{width:28px;height:28px;transition:transform .2s}"+
"#dm-btn.dm-open svg{transform:rotate(90deg)}"+
"#dm-frame{position:fixed;z-index:2147483645;border:none;border-radius:16px;"+
"box-shadow:0 8px 30px rgba(0,0,0,.12),0 2px 8px rgba(0,0,0,.08);"+
"opacity:0;transform:translateY(12px) scale(.96);"+
"transition:opacity .25s ease,transform .25s ease;"+
"pointer-events:none;background:#fff}"+
"#dm-frame.dm-show{opacity:1;transform:translateY(0) scale(1);pointer-events:auto}"+
"@media(min-width:640px){#dm-frame{bottom:90px;right:20px;width:400px;height:600px}}"+
"@media(max-width:639px){#dm-frame{top:0;left:0;right:0;bottom:0;width:100%;height:100%;border-radius:0}}";
document.head.appendChild(s);

var chatI='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
var closeI='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

var btn=document.createElement("button");
btn.id="dm-btn";btn.innerHTML=chatI;
btn.setAttribute("aria-label","Open chat");
document.body.appendChild(btn);

var fr=document.createElement("iframe");
fr.id="dm-frame";fr.title="Chat widget";
fr.allow="clipboard-write";
document.body.appendChild(fr);

function toggle(){
  isOpen=!isOpen;
  if(isOpen){
    if(!fr.src)fr.src=CHAT_URL;
    fr.classList.add("dm-show");
    btn.classList.add("dm-open");
    btn.innerHTML=closeI;
    btn.setAttribute("aria-label","Close chat");
  }else{
    fr.classList.remove("dm-show");
    btn.classList.remove("dm-open");
    btn.innerHTML=chatI;
    btn.setAttribute("aria-label","Open chat");
  }
}
btn.addEventListener("click",toggle);

window.addEventListener("message",function(e){
  if(e.origin!==ORIGIN)return;
  var d=e.data;
  if(!d||d.type!=="dropmodel")return;
  if(d.action==="close"&&isOpen)toggle();
});
})();`;
}
