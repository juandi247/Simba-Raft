const NS='http://www.w3.org/2000/svg';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
const io=new IntersectionObserver(es=>es.forEach(e=>{e.target._v=e.isIntersecting}),{threshold:.2});
const watch=el=>{el._v=false;io.observe(el)};
const until=async el=>{while(!el._v)await sleep(250)};
const mk=(p,tag,a,txt)=>{const e=document.createElementNS(NS,tag);for(const k in a)e.setAttribute(k,a[k]);if(txt!==undefined)e.textContent=txt;p.append(e);return e};
const css=n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim();

// a dot travelling from a to b (frac = how far it goes)
function fly(svg,a,b,ms,color,frac=1){
  const d=mk(svg,'circle',{r:6,cx:0,cy:0,fill:color});
  d.style.filter=`drop-shadow(0 0 5px ${color})`;
  const p=t=>`translate(${a.x+(b.x-a.x)*t}px,${a.y+(b.y-a.y)*t}px)`;
  const an=d.animate([{transform:p(0)},{transform:p(frac)}],{duration:ms,fill:'forwards',easing:'linear'});
  return {d,done:an.finished.catch(()=>{})};
}
const node=(svg,x,y,id,r=26)=>{const c=mk(svg,'circle',{cx:x,cy:y,r,class:'nd f'});mk(svg,'text',{x,y:y+4,class:'t'},id);return c};
const hit=c=>{c.classList.remove('hit');void c.getBBox();c.classList.add('hit')};

// ---- Raft: election loop ----
(async()=>{
  const svg=document.getElementById('raftsvg');watch(svg);
  const P=[{x:160,y:45},{x:60,y:140},{x:260,y:140}];
  P.forEach((a,i)=>P.slice(i+1).forEach(b=>mk(svg,'line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y,class:'ln'})));
  const N=P.map((p,i)=>node(svg,p.x,p.y,'n'+(i+1)));
  const R=P.map(p=>mk(svg,'text',{x:p.x,y:p.y+42,class:'tm'},'follower'));
  const cap=mk(svg,'text',{x:160,y:205,class:'cap'},'');
  const role=(i,c,n)=>{N[i].setAttribute('class','nd '+c);R[i].textContent=n};
  if(reduce){role(0,'l','leader');cap.textContent='n1 is the leader';return}
  while(true){
    await until(svg);
    [0,1,2].forEach(i=>role(i,'f','follower'));cap.textContent='followers wait for a heartbeat…';await sleep(1800);
    role(0,'c','candidate');cap.textContent='timeout: n1 asks for votes';
    await Promise.all([1,2].map(i=>fly(svg,P[0],P[i],900,css('--msg-vote')).done.then(()=>hit(N[i]))));
    cap.textContent='votes granted';
    const back=[1,2].map(i=>fly(svg,P[i],P[0],900,css('--msg-vote-r')));
    await Promise.all(back.map(b=>b.done));hit(N[0]);
    svg.querySelectorAll('circle:not(.nd)').forEach(d=>d.remove());
    role(0,'l','leader');cap.textContent='majority: n1 is the leader';
    for(let k=0;k<3;k++){await Promise.all([1,2].map(i=>fly(svg,P[0],P[i],800,css('--color-accent')).done.then(()=>hit(N[i]))));svg.querySelectorAll('circle:not(.nd)').forEach(d=>d.remove());await sleep(250)}
    cap.textContent='the leader sends heartbeats';await sleep(1200);
  }
})();

// ---- MatrixChecker terminal ----
(async()=>{
  const t=document.getElementById('term');watch(t);
  const ln=h=>{const d=document.createElement('div');d.innerHTML=h;t.append(d);return d};
  const fmt=n=>String(n).replace(/\B(?=(\d{3})+(?!\d))/g,'_');
  const MAX=5000000;
  if(reduce){
    ln('<span class="pr">$</span> matrixchecker -seeds 1..1000 -fuzz low,medium,high');
    ln('Testing SEED 134324 fuzz=low');ln('<span class="ok">✓ SEED 134324 was successful</span>');
    ln('Testing SEED 2233 fuzz=high');ln('<span class="bad">panic: assertion failed: split brain, node 4 and node 5 are leaders in term 7</span>');return;
  }
  const test=async(seed,fuzz,stop)=>{
    const d=ln('');
    const end=stop??1;
    for(let p=0;p<=end*100;p+=4){
      d.innerHTML=`Testing SEED ${seed} fuzz=${fuzz} <span class="dim">tick ${fmt(Math.round(MAX*p/100))}/${fmt(MAX)}</span>`;
      await sleep(stop?95:45);
    }
    return d;
  };
  while(true){
    await until(t);t.replaceChildren();
    ln('<span class="pr">$</span> matrixchecker -seeds 1..1000 -fuzz low,medium,high -maxticks 5_000_000');
    await sleep(700);
    for(const [seed,fuzz] of [[134324,'low'],[77012,'medium']]){
      await test(seed,fuzz);ln(`<span class="ok">✓ SEED ${seed} was successful</span>`);await sleep(350);
    }
    await test(2233,'high',.31);await sleep(900);
    ln('');
    ln('<span class="bad">panic: assertion failed: split brain</span>');
    ln('<span class="bad">node 4 and node 5 are leaders in term 7 (tick 1_550_212)</span>');
    ln('<span class="dim">raft.(*Node).assertOneLeaderPerTerm</span>');
    ln('<span class="dim">    raft/assertions.go:87</span>');
    ln('<span class="pr">replay:</span> simulation -seed 2233 -fuzz high');
    ln('<span class="cur"></span>');
    await sleep(6000);
  }
})();

// ---- Time: an integer ----
(()=>{
  const box=document.getElementById('ticks'),tk=document.getElementById('tk');watch(box);
  for(let i=0;i<20;i++)box.append(document.createElement('i'));
  let t=0;
  setInterval(()=>{if(!box._v||reduce)return;t++;tk.textContent=t;[...box.children].forEach((c,i)=>c.classList.toggle('on',i<=t%20))},350);
  if(reduce)tk.textContent='42';
})();

// ---- Network: queue of events ----
(()=>{
  const ul=document.getElementById('queue'),qt=document.getElementById('qt');watch(ul);
  const T=[['RequestVote','n1 → n2','--msg-vote'],['VoteGranted','n2 → n1','--msg-vote-r'],['AppendEntries','n1 → n3','--color-accent'],['NewEntry','client → n1','--msg-new']];
  let t=0,q=[],id=0;
  const draw=()=>{ul.replaceChildren(...q.map(m=>{const li=document.createElement('li');li.style.setProperty('--m',css(m.c));li.innerHTML=`<span>${m.n}</span><span>${m.r} @ ${m.at}</span>`;if(m.old)li.style.animation='none';m.old=true;return li}))};
  setInterval(()=>{
    if(!ul._v||reduce)return;
    t++;qt.textContent=t;
    q=q.filter(m=>m.at>t);
    if(t%2===0&&q.length<5){const [n,r,c]=T[id++%4];q.push({n,r,c,at:t+2+(id*7)%4});q.sort((a,b)=>a.at-b.at)}
    draw();
  },700);
})();

// ---- DST: time machine ----
(()=>{
  const m=document.querySelector('.machine'),cpu=document.getElementById('cpu'),cl=document.getElementById('cl');watch(m);
  let r=0;
  const draw=()=>{cpu.textContent=r.toFixed(1)+' s';const h=r*24;cl.textContent=h<48?Math.round(h)+' h':(h/24).toFixed(1)+' days'};
  if(reduce){r=10;draw();return}
  setInterval(()=>{if(!m._v)return;r=r>=10?0:r+.1;draw()},100);
})();

// ---- Fault injection panels ----
document.querySelectorAll('.mini').forEach(async svg=>{
  watch(svg);
  const A={x:50,y:60},B={x:270,y:60};
  mk(svg,'line',{x1:A.x,y1:A.y,x2:B.x,y2:B.y,class:'ln'});
  const a=node(svg,A.x,A.y,'n1'),b=node(svg,B.x,B.y,'n2');
  const cap=mk(svg,'text',{x:160,y:128,class:'cap'},'');
  const badge=mk(svg,'circle',{cx:B.x+20,cy:B.y-20,r:9,class:'badge'});
  const bx=mk(svg,'text',{x:B.x+20,y:B.y-15,class:'t'},'✕');bx.style.opacity=0;
  const col=css('--msg-vote');
  const send=(ms,c=col,f=1)=>fly(svg,{x:A.x+32,y:A.y},{x:B.x-32,y:B.y},ms,c,f);
  const clean=()=>svg.querySelectorAll('circle:not(.nd):not(.badge)').forEach(d=>d.remove());
  const s=svg.dataset.scn;
  if(reduce){cap.textContent={lat:'latency: 3 ticks',dup:'delivered twice',loss:'message lost',crash:'n2 is down'}[s];return}
  const scn={
    lat:async()=>{for(const l of [2,8]){cap.textContent=`latency: ${l} ticks`;await send(l*260).done;hit(b);clean();await sleep(500)}},
    dup:async()=>{cap.textContent='n1 sends one message';const p1=send(1500);await sleep(350);const p2=send(1500);await p1.done;hit(b);cap.textContent='n2 gets it twice';await p2.done;hit(b);await sleep(700);clean()},
    loss:async()=>{cap.textContent='n1 sends a message';const p=send(1800,col,.55);await p.done;p.d.setAttribute('fill',css('--color-down'));cap.textContent='lost in the network';p.d.animate([{opacity:1},{opacity:0}],{duration:800,fill:'forwards'});await sleep(1200);clean()},
    crash:async()=>{
      cap.textContent='n2 is alive';await send(1200).done;hit(b);clean();await sleep(400);
      b.setAttribute('class','nd down');badge.classList.add('on');bx.style.opacity=1;cap.textContent='n2 crashed';await sleep(700);
      const p=send(1200);await p.done;p.d.setAttribute('fill',css('--color-down'));cap.textContent='message dropped';await sleep(700);clean();
      b.setAttribute('class','nd f');badge.classList.remove('on');bx.style.opacity=0;hit(b);cap.textContent='n2 is back to life';await sleep(1200);
    }
  }[s];
  while(true){await until(svg);await scn();await sleep(400)}
});