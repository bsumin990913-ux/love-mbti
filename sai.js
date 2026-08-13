const app = document.querySelector('#app');

/* 한 번의 검사를 가리키는 값. 서버가 이 값으로 덮어쓰기(upsert)하므로
   결과를 본 뒤 뒤로 가서 답을 고쳐도 기록이 여러 줄로 늘어나지 않는다 */
let sessionId = randomId();

function randomId(){
  try{
    const bytes=new Uint8Array(9);
    window.crypto.getRandomValues(bytes);
    return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
  }catch(_){
    return Date.now().toString(36)+Math.random().toString(36).slice(2,10);
  }
}

const state = {
  step: -1,
  answers: {},
  selected: [],
  rank: [],
  reply: '',
  empathy: 50,
  boards: {},
  boardPages: {},
  participant: ''
};
let draggedRankIndex = null;
let draggedBoardItem = null;
let selectedBoardItem = null;

/* 문항 정의는 sai-questions.js 에 있다. 관리자 페이지도 같은 파일을 읽어
   저장된 답을 문항 본문과 맞춘다 */
const questions = SAI_QUESTIONS;

function layout(content, bottom=''){
  return `<div class="shell"><header class="topbar"><div class="brand"><i>사이</i>연구소</div><div>${state.step>=0&&state.step<questions.length?'<button class="ghost" onclick="goHome()">나가기</button>':''}</div></header>${content}${bottom}</div>`;
}

function home(){
  state.step=-1;
  app.innerHTML=layout(`<section class="screen hero"><span class="eyebrow">관계 반응 탐색 · 약 5분</span><h1>평소의 나와<br>연애할 때의 나는<br>얼마나 다를까요?</h1><p class="lead">정답이 보이는 성격 문항 대신, 실제 상황에서 내가 하는 선택과 반응 순서를 살펴봐요.</p><div class="feature-grid"><div class="feature"><b>일상과 연애를 따로</b><span>기본 성향과 관계가 가까워졌을 때의 변화를 비교해요.</span></div><div class="feature"><b>카톡처럼 직접 답장</b><span>고른 답보다 실제 말투와 표현 방식을 함께 살펴봐요.</span></div><div class="feature"><b>유형보다 행동 패턴</b><span>애착 불안·회피, 경계 설정, 공감과 회복 방식을 입체적으로 보여줘요.</span></div></div><p class="note">이 테스트는 자기이해를 위한 체험형 도구이며 임상 진단이나 공식 MBTI® 검사가 아닙니다.</p></section>`,`<div class="bottom"><button class="primary" onclick="start()">내 관계 반응 알아보기</button></div>`);
  document.querySelector('.feature-grid').insertAdjacentHTML('beforebegin',`<div class="name-field"><label for="participant">결과에 표시할 이름 또는 닉네임</label><input id="participant" maxlength="20" placeholder="이름 또는 닉네임 입력" value="${escapeHTML(state.participant)}"></div>`);
}

function start(){const input=document.querySelector('#participant');if(input&&!input.value.trim()){input.focus();return}if(input)state.participant=input.value.trim();sessionId=randomId();state.step=0;state.answers={};state.selected=[];state.rank=[];state.boards={};state.boardPages={};selectedBoardItem=null;render();}
function goHome(){ if(confirm('지금까지 선택한 내용은 사라져요. 나갈까요?')) home(); }
function progress(){ return `<div class="progress-wrap"><div class="progress-meta"><span>${state.step+1} / ${questions.length}</span><span>${Math.round((state.step/questions.length)*100)}%</span></div><div class="progress"><span style="width:${((state.step+1)/questions.length)*100}%"></span></div></div>`; }
function optionMarkup(options,multi=false){return `<div class="options">${options.map(([id,text])=>{const on=multi?state.selected.includes(id):state.answers[state.step]===id;return `<button class="option ${on?'selected':''}" onclick="choose('${id}',${multi})"><span class="check">${on?'✓':''}</span><span>${text}</span></button>`}).join('')}</div>`}
function choose(id,multi){ if(multi){ state.selected=state.selected.includes(id)?state.selected.filter(x=>x!==id):[...state.selected,id]; } else state.answers[state.step]=id; render(); }
function canNext(q){if(q.type==='multi')return state.selected.length>0;if(q.type==='rank'||q.type==='loveRank')return state.rank.length>0;if(q.type==='board'){const page=state.boardPages[state.step]||0;return q.items.slice(page*6,page*6+6).every(([id])=>(state.boards[state.step]||{})[id])}if(q.type==='reply')return state.reply.trim().length>=2;if(q.type==='empathy')return true;return !!state.answers[state.step]}
function next(){
  const q=questions[state.step];
  if(q.type==='board'){
    const page=state.boardPages[state.step]||0;
    if((page+1)*6<q.items.length){state.boardPages[state.step]=page+1;selectedBoardItem=null;render();window.scrollTo(0,0);return;}
  }
  if(q.type==='multi'){state.answers[state.step]=[...state.selected];state.rank=[...state.selected];}
  if(q.type==='rank')state.answers[state.step]=[...state.rank];
  if(q.type==='loveRank')state.answers[state.step]=[...state.rank];
  if(q.type==='board')state.answers[state.step]={...(state.boards[state.step]||{})};
  if(q.type==='reply')state.answers[state.step]=state.reply;
  if(q.type==='empathy')state.answers[state.step]=state.empathy;
  state.step+=q.type==='multi'&&state.selected.length===1?2:1;
  if(state.step>=questions.length){result();enrichResult();}else render();
  window.scrollTo(0,0);
}
function back(){
  if(state.step===0){home();return;}
  const current=questions[state.step];
  if(current?.type==='board'&&(state.boardPages[state.step]||0)>0){state.boardPages[state.step]--;selectedBoardItem=null;render();window.scrollTo(0,0);return;}
  state.step--;
  if(state.step===1&&(state.answers[0]||[]).length===1)state.step=0;
  const q=questions[state.step];
  if(q.type==='multi')state.selected=[...(state.answers[state.step]||[])];
  if(q.type==='rank')state.rank=[...(state.answers[state.step]||state.rank)];
  if(q.type==='loveRank')state.rank=[...(state.answers[state.step]||q.options.map(x=>x[0]))];
  render();
}
function move(i,d){const j=i+d;if(j<0||j>=state.rank.length)return;[state.rank[i],state.rank[j]]=[state.rank[j],state.rank[i]];render()}
function rankDragStart(event,i){draggedRankIndex=i;event.currentTarget.classList.add('dragging');if(event.dataTransfer){event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',String(i));}}
function rankDragOver(event,i){event.preventDefault();if(draggedRankIndex===null||draggedRankIndex===i)return;const item=state.rank.splice(draggedRankIndex,1)[0];state.rank.splice(i,0,item);draggedRankIndex=i;render()}
function rankDragEnd(){draggedRankIndex=null;document.querySelectorAll('.rank-item').forEach(el=>el.classList.remove('dragging','drag-over'))}
function rankTouchStart(event,i){draggedRankIndex=i;event.currentTarget.classList.add('dragging')}
function rankTouchMove(event){if(draggedRankIndex===null)return;const touch=event.touches[0];const el=document.elementFromPoint(touch.clientX,touch.clientY)?.closest('.rank-item');if(!el)return;const i=Number(el.dataset.index);if(i!==draggedRankIndex){const item=state.rank.splice(draggedRankIndex,1)[0];state.rank.splice(i,0,item);draggedRankIndex=i;render()}}
function rankTouchEnd(){rankDragEnd()}
function labelFor(id){return questions[0].options.find(x=>x[0]===id)?.[1]||id}
function questionLabel(q,id){return q.options?.find(x=>x[0]===id)?.[1]||q.items?.find(x=>x[0]===id)?.[1]||id}
function boardDragStart(event,id){draggedBoardItem=id;if(event.dataTransfer){event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',id)}}
function boardDrop(event,zone){event.preventDefault();const id=draggedBoardItem||event.dataTransfer?.getData('text/plain');if(!id)return;assignBoard(id,zone)}
function boardSelect(id){selectedBoardItem=selectedBoardItem===id?null:id;render()}
function boardZoneClick(zone){if(selectedBoardItem)assignBoard(selectedBoardItem,zone)}
function assignBoard(id,zone){state.boards[state.step]??={};state.boards[state.step][id]=zone;selectedBoardItem=null;draggedBoardItem=null;render()}

function render(){
  const q=questions[state.step]; let body='';
  if(q.type==='loveRank'&&(!state.rank.length||state.rank.some(id=>!q.options.some(x=>x[0]===id))))state.rank=q.options.map(x=>x[0]);
  if(q.type==='multi'||q.type==='single') body=`${q.scenario?`<div class="scenario">${q.scenario}</div>`:''}${optionMarkup(q.options,q.type==='multi')}`;
  if(q.type==='rank') body=`<div class="rank-list">${state.rank.map((id,i)=>`<div class="rank-item" data-index="${i}" draggable="true" ondragstart="rankDragStart(event,${i})" ondragover="rankDragOver(event,${i})" ondragend="rankDragEnd()" ontouchstart="rankTouchStart(event,${i})" ontouchmove="rankTouchMove(event)" ontouchend="rankTouchEnd()"><span class="rank-no">${i+1}</span><span>${labelFor(id)}</span><span class="grip" aria-hidden="true">⠿</span></div>`).join('')}</div><p class="drag">카드를 누른 채 위아래로 끌어 순서를 바꿔주세요.</p>`;
  if(q.type==='loveRank') body=`<div class="rank-list">${state.rank.map((id,i)=>`<div class="rank-item love" data-index="${i}" draggable="true" ondragstart="rankDragStart(event,${i})" ondragover="rankDragOver(event,${i})" ondragend="rankDragEnd()" ontouchstart="rankTouchStart(event,${i})" ontouchmove="rankTouchMove(event)" ontouchend="rankTouchEnd()"><span class="rank-no">${i+1}</span><span>${questionLabel(q,id)}</span><span class="grip">⠿</span></div>`).join('')}</div><p class="drag">가장 사랑받는다고 느끼는 요소를 위로 끌어주세요.</p>`;
  if(q.type==='board'){
    const placed=state.boards[state.step]||{};
    const page=state.boardPages[state.step]||0,totalPages=Math.ceil(q.items.length/6),batch=q.items.slice(page*6,page*6+6);
    const unplaced=batch.filter(([id])=>!placed[id]);
    body=`<div class="board-page-meta"><strong>${page+1}번째 묶음</strong><span>${page+1} / ${totalPages}</span></div><div class="board-help">이번 화면의 ${batch.length}개만 배치해요. PC에서는 끌어놓고, 모바일에서는 항목과 칸을 차례로 눌러주세요.</div><div class="item-bank">${unplaced.map(([id,text])=>`<button class="board-chip ${selectedBoardItem===id?'selected':''}" draggable="true" ondragstart="boardDragStart(event,'${id}')" onclick="boardSelect('${id}')">${text}</button>`).join('')||'<span class="note">이번 묶음을 모두 배치했어요.</span>'}</div><div class="board-zones">${q.zones.map(([zone,title])=>{const items=batch.filter(([id])=>placed[id]===zone);return `<div class="board-zone" ondragover="event.preventDefault();this.classList.add('over')" ondragleave="this.classList.remove('over')" ondrop="this.classList.remove('over');boardDrop(event,'${zone}')" onclick="boardZoneClick('${zone}')"><div class="zone-title">${title}<span>${items.length}개</span></div><div class="zone-items">${items.map(([id,text])=>`<button class="board-chip ${selectedBoardItem===id?'selected':''}" draggable="true" ondragstart="boardDragStart(event,'${id}')" onclick="event.stopPropagation();boardSelect('${id}')">${text}</button>`).join('')||'<span class="board-empty">이 묶음에서 선택 없음</span>'}</div></div>`}).join('')}</div>`;
  }
  if(q.type==='reply') body=`<div class="chat"><div class="date">오늘 오후 7:42</div><div class="sender">연인</div><div class="bubble theirs">이번 주는 그냥 각자 쉬면 안 될까?</div><div class="bubble theirs">요즘 좀 정신이 없네</div></div><div class="textarea-wrap"><textarea maxlength="160" placeholder="실제로 보낼 답장을 입력해주세요" oninput="state.reply=this.value; document.querySelector('.count').textContent=this.value.length+'/160'; document.querySelector('.primary').disabled=this.value.trim().length<2">${state.reply}</textarea><span class="count">${state.reply.length}/160</span></div><p class="note">문장 자체만으로 판단하지 않고, 다음 단계에서 감정과 행동 맥락을 함께 살펴봅니다.</p>`;
  if(q.type==='empathy') body=`<div class="dialogue"><div class="line"><span class="avatar a">A</span><span>요즘 네가 전보다 연락이 줄어서 조금 신경 쓰여. 횟수보다 달라진 이유를 모르겠는 게 불안해.</span></div><div class="line"><span class="avatar b">B</span><span>바쁘다고 말했잖아. 내가 괜찮다고 계속 설명해야 하는 것도 부담스러워.</span></div></div><div class="range-labels"><span>A에게 더 공감</span><span>B에게 더 공감</span></div><input class="range" type="range" min="0" max="100" value="${state.empathy}" oninput="state.empathy=+this.value; document.querySelector('.range-value').textContent=empathyText(state.empathy)"><div class="range-value">${empathyText(state.empathy)}</div>`;
  app.innerHTML=layout(`<section class="screen">${progress()}<div class="context">${q.context}</div><h2>${q.title}</h2><p class="question-copy">${q.copy}</p>${body}</section>`,`<div class="bottom"><button class="primary" ${canNext(q)?'':'disabled'} onclick="next()">${state.step===questions.length-1?'결과 확인하기':'다음'}</button><button class="ghost" style="width:100%;margin-top:5px" onclick="back()">이전</button></div>`);
}
function empathyText(v){if(v<30)return 'A의 마음이 더 먼저 이해돼요';if(v>70)return 'B의 마음이 더 먼저 이해돼요';return '두 사람 모두 비슷하게 이해돼요'}

function enrichResult(){
  const multi=state.answers[0]||[];
  const first=(state.answers[1]||[])[0];
  const boundary=state.answers[2];
  const refusal=state.answers[5];
  const friendChoice=state.answers[6];
  const loverChoice=state.answers[7];
  const empathy=state.answers[4]||50;
  const energy=state.answers[8], information=state.answers[9], judgment=state.answers[10], planning=state.answers[11];
  const intimacy=state.answers[12], conflict=state.answers[13], loveBoundary=state.answers[14], repair=state.answers[15];
  const moneyFriend=state.answers[16],moneyLove=state.answers[17],feedback=state.answers[18],loveFeedback=state.answers[19];
  const jealousy=state.answers[20],affection=state.answers[21],publicMisunderstanding=state.answers[22],loveMisunderstanding=state.answers[23];
  const future=state.answers[24],support=state.answers[25],decision=state.answers[26],busyContact=state.answers[27];
  const vulnerability=state.answers[28],repeatConflict=state.answers[29],independence=state.answers[30],recovery=state.answers[31];
  let anxiety=24+(multi.includes('review')?12:0)+(multi.includes('check')?7:0)+(first==='review'?6:0)+(loverChoice==='reason'?6:0)+(loverChoice==='withdraw'?7:0)+(intimacy==='worry'?10:0)+(conflict==='follow'?9:0)+(repair==='remain'?6:0)+(loveFeedback==='ask'||loveFeedback==='ruminate'?8:0)+(jealousy==='monitor'?9:0)+(affection==='mirror'?8:0);
  let avoidance=20+(refusal==='space'?10:0)+(first==='continue'?6:0)+(boundary==='delay'?5:0)+(conflict==='close'?9:0)+(loveBoundary==='distance'?10:0)+(loveBoundary==='avoidTalk'?6:0)+(future==='avoid'?8:0)+(support==='hold'?5:0)+(vulnerability==='minimize'?8:0)+(independence==='protect'?5:0);
  anxiety=Math.min(92,anxiety); avoidance=Math.min(88,avoidance);
  const dailyExpression=boundary==='clear'?72:boundary==='explain'?64:48;
  const loveExpression=['boundary','share','show'].includes(loveBoundary)||['share','askSmall'].includes(support)?74:['distance','minimize','hold'].includes(loveBoundary)||['minimize','hold'].includes(vulnerability)?38:56;
  const attachment=anxiety>=60&&avoidance>=55?'불안-회피 경향':anxiety>=60?'불안 애착 경향':avoidance>=55?'회피 애착 경향':'안정 애착 경향';
  const mbti=`${energy==='out'?'E':'I'}${information==='system'||information==='try'?'N':'S'}${judgment==='solve'?'T':'F'}${planning==='plan'?'J':'P'}`;
  const head=document.querySelector('.result-head');
  document.querySelector('.chart-card').innerHTML=`<h3>일상과 연애의 차이</h3><div class="legend"><span><i class="dot"></i>일상</span><span><i class="dot"></i>연애</span></div>${chartRow('표현의 직접성',dailyExpression,loveExpression)}${chartRow('관계 단서 민감도',44,anxiety)}${chartRow('거리 두기',35,avoidance)}`;
  head.querySelector('.lead').textContent='성향과 애착 유형을 함께 보고, 평소와 연애 상황에서 달라지는 반응도 비교했어요.';
  head.insertAdjacentHTML('afterend',`<div class="type-grid"><div class="type-card"><small>성향 탐색 결과</small><strong>${mbti}</strong><p>공식 MBTI®가 아닌 상황 기반 선호 지표</p></div><div class="type-card"><small>애착 반응 결과</small><strong style="font-size:20px">${attachment}</strong><p>불안 ${anxiety} · 회피 ${avoidance}</p></div></div>`);
  const axisEvidence=buildAxisEvidence({energy,information,judgment,planning,decision,feedback,recovery,publicMisunderstanding,busyContact,future});
  document.querySelector('.type-grid').insertAdjacentHTML('afterend',`<section class="axis-section"><h3>왜 ${mbti}로 추정했을까요?</h3><p class="note">서로 다른 장면에서 반복된 선택과 반대 신호를 함께 읽었어요.</p>${axisEvidence.map(axis=>`<div class="axis-card"><div class="axis-head"><strong>${axis.pair} · ${axis.name}</strong><span class="axis-badge">${axis.result} 쪽 ${axis.confidence}%</span></div><ul class="axis-evidence">${axis.evidence.map(text=>`<li>${text}</li>`).join('')}</ul><p class="axis-conclusion">${axis.conclusion}</p><div class="axis-meter"><span style="width:${axis.confidence}%"></span></div></div>`).join('')}</section>`);
  const portrait=buildPortrait({anxiety,avoidance,energy,judgment,loveBoundary,conflict,repair});
  document.querySelector('.axis-section').insertAdjacentHTML('afterend',`<div class="portrait"><span class="eyebrow">모든 답변을 천천히 이어 보면</span><h3>${portrait.title}</h3><p>${portrait.body}</p><p>${portrait.care}</p></div>`);
  const reply=(state.answers[3]||'').trim();
  const hasQuestion=/[?？]|왜|무슨|괜찮|일 있어/.test(reply);
  const hasFeeling=/서운|아쉽|걱정|불안|속상|좋아|괜찮아/.test(reply);
  const hasPlan=/다음|나중|언제|주말|연락|얘기/.test(reply);
  const hasBlame=/맨날|항상|됐어|마음대로|또 이래|나 싫/.test(reply);
  const replyStyle=buildReplyNarrative({reply,hasBlame,hasFeeling,hasQuestion,hasPlan});
  const comparison=buildRelationshipDifference(friendChoice,loverChoice);
  const disclaimer=document.querySelector('.disclaimer');
  document.querySelectorAll('.insight').forEach(card=>card.remove());
  const deep=buildDeepInsights({boundary,refusal,loveBoundary,moneyFriend,moneyLove,feedback,loveFeedback,jealousy,affection,publicMisunderstanding,loveMisunderstanding,future,support,busyContact,vulnerability,repeatConflict,independence,recovery,conflict,repair,anxiety,avoidance});
  disclaimer.insertAdjacentHTML('beforebegin',`${deep.map(item=>`<div class="insight"><b>${item.title}</b><p>${item.body}</p></div>`).join('')}<div class="insight"><b>당신이 고른 말에는 이런 마음이 보여요</b><blockquote class="reply-quote">${escapeHTML(reply)}</blockquote><p>${replyStyle}</p></div><div class="insight"><b>가까운 사람 앞에서 달라지는 마음</b><p>${comparison}</p></div>`);
  const pairedDifferences=[friendChoice!==loverChoice,moneyFriend!==moneyLove,feedback!==loveFeedback,publicMisunderstanding!==loveMisunderstanding].filter(Boolean).length;
  const modeScore=Math.min(99,Math.round(pairedDifferences*13+Math.abs(dailyExpression-loveExpression)*.7+Math.abs(44-anxiety)*.35));
  const modeLabel=modeScore<20?'상황이 달라도 비교적 일관돼요':modeScore<45?'연애에서 일부 반응이 달라져요':'연애에서 반응 전환이 뚜렷해요';
  document.querySelector('.summary-card').innerHTML=`<div class="mode-score"><div class="score-ring" style="--score:${modeScore}"><strong>${modeScore}</strong></div><div class="mode-copy"><small>연애 모드 전환 지수</small><h3>${modeLabel}</h3><p>숫자 자체보다 어떤 상황에서 변화하는지 함께 확인해보세요.</p></div></div>`;
  document.querySelector('.disclaimer').textContent='현재 결과는 35개 상황·정렬·배치 문항을 여러 영역에서 교차해 읽은 확장판입니다. 자기이해를 돕는 탐색 결과이며 정신건강 상태를 진단하거나 공식 MBTI® 유형을 판정하지 않습니다.';
  saveTestRecord({mbti,attachment,anxiety,avoidance});
}

function choiceLabel(questionIndex,id){return questions[questionIndex].options.find(option=>option[0]===id)?.[1]||'다른 반응'}
function escapeHTML(value){return value.replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]))}

/* ── 기록 남기기 ─────────────────────────────── */

const LOCAL_RECORDS_KEY = 'oneul-test/records/v1';
const LOCAL_RECORDS_MAX = 200;

function localRecords(){
  try{
    const parsed=JSON.parse(localStorage.getItem(LOCAL_RECORDS_KEY));
    return Array.isArray(parsed)?parsed:[];
  }catch(_){ return []; }
}

/**
 * 결과를 서버에 올린다. 실패해도 사용자에겐 알리지 않는다 —
 * 기록은 관리자용이고, 검사한 사람이 할 수 있는 일이 없다.
 *
 * answers 는 배열이 아니라 문항 인덱스를 키로 하는 객체다. 1번(rank)은
 * 건너뛸 수 있어서 인덱스가 비므로, 배열로 만들면 뒤가 한 칸씩 밀린다.
 */
function saveTestRecord(resultData){
  const record={
    sessionId,
    test:'sai',
    testLabel:'관계 반응',
    name:state.participant||'이름 없음',
    code:resultData.mbti,
    nick:resultData.attachment,
    answers:{...state.answers},
    scores:{anxiety:resultData.anxiety,avoidance:resultData.avoidance},
    total:questions.length,
    createdAt:new Date().toISOString()
  };

  try{
    const rows=localRecords().filter(r=>r.sessionId!==record.sessionId);
    rows.unshift(record);
    localStorage.setItem(LOCAL_RECORDS_KEY,JSON.stringify(rows.slice(0,LOCAL_RECORDS_MAX)));
  }catch(_){ /* 저장 공간이 없어도 검사 자체는 끝났다 */ }

  fetch('/api/submit',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify(record),
    keepalive:true
  }).catch(()=>{ /* 오프라인이거나 저장소 미설정 — 로컬 기록만 남는다 */ });
}

function buildPortrait({anxiety,avoidance,energy,judgment,loveBoundary,conflict,repair}){
  const title=anxiety>=60
    ?'당신은 관계를 가볍게 여기지 않기에, 작은 변화도 그냥 지나치지 못하는 사람 같아요.'
    :avoidance>=55
      ?'당신은 마음을 지키면서도 관계를 잃지 않을 방법을 오래 고민하는 사람 같아요.'
      :'당신은 상대와 나 사이에 무리가 생기지 않도록 관계의 속도를 조율하는 사람 같아요.';
  const opening=energy==='out'
    ?'사람들과 말을 주고받는 동안 생각이 선명해지고, 관계 안에서 답을 찾아가는 힘이 있습니다.'
    :'먼저 상황을 살피고 마음속에서 충분히 정리한 뒤 움직이는 편입니다. 서두르지 않는 태도는 관계를 함부로 판단하지 않게 해주는 힘이기도 해요.';
  const middle=judgment==='solve'
    ?'감정이 복잡해져도 무엇을 바꿀 수 있는지 찾으려는 현실적인 면이 보입니다.'
    :'누가 옳은지를 서둘러 가르기보다, 그 사람이 왜 그런 마음이 되었는지 이해하려는 쪽에 가깝습니다.';
  const boundary=loveBoundary==='boundary'
    ?'또 불편한 일을 무조건 참기보다, 가능한 다른 방법을 함께 찾으려는 경계의 감각도 있습니다.'
    :loveBoundary==='adapt'
      ?'다만 사랑하는 사람이 원한다면 내 불편을 조금 뒤로 미루는 때가 있어 보여요. 잘 맞춰주는 능력과 나를 오래 참게 하는 습관은 겉모습이 꽤 비슷하니 가끔 구분해 볼 필요가 있습니다.'
      :'마음이 불편할 때 곧바로 말하기보다는 조용히 거리를 두어 나를 보호하려는 모습도 보입니다. 그것은 차가움이라기보다, 더 다치기 전에 숨을 고르는 방식에 가까울 수 있어요.';
  const care=conflict==='follow'
    ?'대화가 끊기는 순간을 관계가 멀어지는 신호처럼 느낄 수도 있겠습니다. 그럴 때 필요한 것은 마음을 억지로 누르는 일이 아니라, “지금은 멈추되 언제 다시 이야기할지”를 함께 정하는 작은 약속일 거예요.'
    :conflict==='close'
      ?'상대가 물러서면 나도 더 다가가지 않는 편일 수 있어요. 서로를 존중하는 침묵인지, 두 사람이 각자 기다리는 고립인지 한 번쯤 확인해 보세요.'
      :repair==='remain'
        ?'사과를 받아도 마음이 바로 따라오지 않을 수 있습니다. 용서가 느린 것이 나쁜 건 아니에요. 다만 괜찮은 척한 채 오래 지켜보기보다, 아직 남아 있는 마음을 작은 문장으로 알려주면 좋겠습니다.'
        :'당신에게 필요한 것은 더 완벽하게 사랑하는 법보다, 이미 잘하고 있는 방식을 믿으면서 내 마음도 같은 무게로 관계 안에 놓는 연습일지 모릅니다.';
  return{title,body:`${opening} ${middle} ${boundary}`,care};
}

function buildAxisEvidence(a){
  const axes=[];
  const isE=a.energy==='out';
  const eCounter=a.decision==='consult'||a.publicMisunderstanding==='private';
  axes.push({pair:'E / I',name:'에너지를 얻고 생각을 정리하는 방향',result:isE?'E':'I',confidence:eCounter!==isE?62:74,evidence:[
    `낯선 모임에서는 “${choiceLabel(8,a.energy)}”를 골랐어요. ${isE?'사람들과 상호작용하며 장면 안으로 들어가는 반응입니다.':'먼저 관찰하거나 소수와 연결하며 에너지를 조절하는 반응입니다.'}`,
    `중요한 결정에서는 “${choiceLabel(26,a.decision)}”를 골랐어요. ${a.decision==='consult'?'말을 주고받으며 생각을 선명하게 하는 E 신호도 함께 보입니다.':'결정의 기준을 내 안에서 정리하려는 I 신호와 잘 이어집니다.'}`,
    `오해가 생긴 단체 대화에서는 “${choiceLabel(22,a.publicMisunderstanding)}”를 택했습니다. ${a.publicMisunderstanding==='private'?'공개된 장면보다 일대일 연결을 편하게 여기는 모습입니다.':'필요한 순간에는 바깥으로 바로 대응할 수 있다는 반대 신호도 있습니다.'}`
  ],conclusion:`한 장면만 보면 양쪽 모습이 있지만, 편안한 기본값은 ${isE?'사람과 부딪치며 생각을 만드는 E':'혼자 또는 좁은 관계 안에서 생각을 정리하는 I'}에 조금 더 가까워 보여요.`});

  const isN=a.information==='system'||a.information==='try';
  const nCounter=a.feedback==='extract'||a.decision==='criteria';
  axes.push({pair:'S / N',name:'정보를 받아들이는 방식',result:isN?'N':'S',confidence:nCounter!==isN?60:72,evidence:[
    `새 가전제품을 익힐 때 “${choiceLabel(9,a.information)}”를 골랐어요. ${isN?'정해진 순서보다 구조와 가능성을 먼저 파악하는 N 쪽 신호입니다.':'확인 가능한 정보와 실제 용도를 먼저 붙잡는 S 쪽 신호입니다.'}`,
    `날카로운 피드백 뒤에는 “${choiceLabel(18,a.feedback)}”를 택했습니다. ${a.feedback==='extract'?'말 전체보다 당장 적용할 구체적인 부분을 추리는 S 신호가 있습니다.':a.feedback==='ruminate'?'사실뿐 아니라 표정과 말투의 의미까지 넓혀 읽는 N 신호가 보입니다.':'추가 맥락을 모아 전체 의미를 이해하려는 모습입니다.'}`,
    `정보가 부족한 결정에서는 “${choiceLabel(26,a.decision)}”를 골랐어요. ${a.decision==='intuition'?'자료가 완성되지 않아도 전체적인 감각을 신뢰하는 N 신호입니다.':'현실적인 기준과 현재 가진 정보를 활용하는 S 신호도 함께 있습니다.'}`
  ],conclusion:`당신은 ${isN?'보이는 사실 뒤의 구조와 의미를 먼저 연결하는 N':'구체적인 사실과 지금 적용할 수 있는 방법을 중시하는 S'} 쪽으로 추정됩니다. 다만 상황에 따라 반대 방식도 꽤 유연하게 사용해요.`});

  const isT=a.judgment==='solve';
  const fSignal=a.loveMisunderstanding==='apologize'||a.publicMisunderstanding==='private';
  axes.push({pair:'T / F',name:'판단의 중심에 두는 것',result:isT?'T':'F',confidence:fSignal!==!isT?61:73,evidence:[
    `친구의 반복되는 고민에는 “${choiceLabel(10,a.judgment)}”를 골랐어요. ${isT?'감정 속에서도 원인과 해결 가능한 지점을 찾는 T 신호입니다.':'해결보다 사람의 마음과 필요한 반응을 먼저 살피는 F 신호입니다.'}`,
    `연인이 메시지를 차갑게 느꼈을 때는 “${choiceLabel(23,a.loveMisunderstanding)}”를 택했습니다. ${a.loveMisunderstanding==='apologize'?'의도보다 상대가 실제로 느낀 영향을 중요하게 보는 F 신호가 뚜렷합니다.':a.loveMisunderstanding==='clarify'?'감정과 사실을 함께 확인하려는 균형 신호입니다.':'내 입장과 책임의 경계를 분명히 하려는 T 신호가 있습니다.'}`,
    `공개된 오해에는 “${choiceLabel(22,a.publicMisunderstanding)}”로 반응했습니다. 관계의 분위기와 문제 해결 중 무엇을 먼저 돌보는지 보여주는 보조 근거예요.`
  ],conclusion:`그래서 ${isT?'관계를 소중히 여기면서도 결론을 낼 때는 논리와 해결 가능성을 먼저 보는 T':'결정을 내릴 때 사람에게 미칠 영향과 관계의 맥락을 먼저 보는 F'}에 조금 더 가깝다고 보았습니다.`});

  const isJ=a.planning==='plan';
  const jSignal=a.busyContact==='notice'||a.future==='practical'||a.decision==='criteria';
  axes.push({pair:'J / P',name:'생활을 조직하고 대응하는 방식',result:isJ?'J':'P',confidence:jSignal===isJ?76:63,evidence:[
    `갑자기 빈 주말에는 “${choiceLabel(11,a.planning)}”를 골랐어요. ${isJ?'시간의 윤곽을 먼저 잡아두는 J 신호입니다.':'일부만 정하거나 흐름에 맡겨 선택지를 열어두는 P 신호입니다.'}`,
    `바쁜 하루의 연락은 “${choiceLabel(27,a.busyContact)}”를 택했습니다. ${a.busyContact==='notice'||a.busyContact==='routine'?'미리 예측 가능성을 만들어두려는 J 신호입니다.':'상황이 실제로 펼쳐지는 대로 대응하는 P 신호입니다.'}`,
    `미래 이야기가 부담스러울 때는 “${choiceLabel(24,a.future)}”를 골랐어요. ${a.future==='practical'?'막연한 가능성을 구체적인 조건으로 바꾸려는 J 신호입니다.':a.future==='avoid'||a.future==='join'?'결론을 서두르지 않고 현재의 흐름을 유지하는 P 신호도 보입니다.':'계획보다 현재 아는 것과 모르는 것을 구분하는 태도가 보입니다.'}`
  ],conclusion:`전체적으로는 ${isJ?'예측 가능한 틀을 만들어 마음의 여유를 확보하는 J':'가능성을 열어두고 상황에 맞게 움직이는 P'}가 기본값에 더 가까워 보여요. 이것은 부지런함이나 게으름이 아니라, 편안함을 만드는 방식의 차이입니다.`});
  return axes;
}

function buildReplyNarrative({reply,hasBlame,hasFeeling,hasQuestion,hasPlan}){
  if(hasBlame)return '이 문장에는 서운함보다 먼저 지친 마음이 느껴집니다. 아마 한 번의 약속 변경만을 말하고 있는 것은 아닐 수도 있어요. 반복해서 설명받지 못했거나, 내 기대만 가벼이 여겨졌다고 느낀 시간이 쌓였을 가능성이 있습니다. 그렇다면 날카로운 말이 나온 자신을 바로 비난하지는 마세요. 다만 상대의 마음을 단정하는 표현은 내가 정말 받고 싶은 답을 멀어지게 할 수 있습니다. “나는 갑작스러운 변경이 반복되면 중요하지 않은 사람이 된 것 같아 서운해”처럼 사건과 마음을 나누어 말해보면 어떨까요?';
  if(hasFeeling&&hasQuestion)return '서운한 마음을 숨기지 않으면서도, 상대에게 설명할 자리를 남겨둔 문장입니다. 내 감정만 밀어붙이지도 않고 상대의 사정만 먼저 돌보지도 않았어요. 이런 말은 관계를 계속 이어가고 싶은 사람이 보내는 말에 가깝습니다. 다만 답이 늦거나 충분하지 않을 때 질문을 거듭하며 스스로를 더 불안하게 만들지는 않는지 살펴봐 주세요. 한 번 묻고 기다리는 일도 대화의 일부니까요.';
  if(hasQuestion)return '당신은 판단보다 확인을 먼저 택했습니다. 상대의 말 너머에 다른 사정이 있을지 살펴보려는 태도는 관계에서 큰 장점이에요. 그런데 질문만 남기면 정작 당신이 아쉬웠다는 사실은 상대가 모를 수도 있습니다. “무슨 일 있어? 갑자기 못 본다니 조금 아쉽네”처럼 궁금함 옆에 내 마음도 한 조각 놓아보세요. 이해하는 사람에게도 이해받을 자리는 필요합니다.';
  if(hasFeeling)return `이 답장에는 내 마음을 감추지 않겠다는 용기가 있습니다. 서운함을 말한다고 해서 상대를 몰아붙이는 것은 아니에요. 오히려 무엇이 중요했는지 알려주는 일이기도 합니다.${hasPlan?' 그리고 다음 만남이나 대화를 제안한 것은, 감정을 전하는 데서 멈추지 않고 관계를 다시 이어보려는 의지로 읽힙니다.':' 여기에 언제 다시 이야기하고 싶은지 한 문장을 더한다면, 상대도 무엇을 하면 좋을지 조금 덜 막막할 거예요.'}`;
  if(reply.length<8)return '아주 짧은 답장을 골랐네요. 짧은 말에는 여러 마음이 함께 들어갈 수 있습니다. 정말 괜찮아서 더 말하지 않은 것일 수도, 지금 말하면 감정이 커질까 봐 멈춘 것일 수도, 상대가 먼저 알아주기를 기다리는 것일 수도 있어요. 짧음 자체는 문제가 아닙니다. 중요한 것은 마음이 가라앉은 뒤 대화를 다시 여는지예요. 그 한 번의 돌아옴이 침묵을 배려로 바꾸어 줍니다.';
  return `당신은 바로 반응하기보다 말을 고르는 편으로 보여요. ${hasPlan?'그리고 다음 행동을 제안해 이 대화가 막다른 곳에 머물지 않게 했습니다.':'다만 정돈된 말 속에 실제 아쉬움이 빠져 있다면, 상대는 당신이 괜찮다고만 이해할 수 있어요.'} 좋은 대화는 완벽한 문장보다 서로가 추측하지 않아도 되는 문장에 가까울 거예요.`;
}

function buildRelationshipDifference(friendChoice,loverChoice){
  if(friendChoice===loverChoice){
    const same={reschedule:'당신은 관계의 종류보다 상대가 처한 사정과 그다음 약속을 더 중요하게 보는 편입니다. 친구든 연인이든 변경 자체를 사랑이나 예의의 척도로 곧바로 해석하지 않는 안정감이 있어요. 다만 반복되는 취소까지 늘 이해하는 쪽으로만 넘기고 있지는 않은지, 내 시간도 같은 무게로 존중받고 있는지는 살펴보면 좋겠습니다.',reason:'당신은 가까움의 정도와 상관없이, 계획이 달라졌다면 그 이유를 알아야 마음이 정리되는 편입니다. 이것은 통제하려는 마음이라기보다 예측할 수 없는 상황을 이해 가능한 이야기로 만들려는 욕구에 가깝습니다. 설명을 들은 뒤 놓아줄 수 있다면 좋은 확인이지만, 납득할 때까지 묻고 있다면 불안을 달래는 일이 상대의 몫이 되고 있지는 않은지 돌아봐도 좋겠습니다.',manners:'당신은 약속을 관계에 대한 존중의 표현으로 받아들이는 편입니다. 그래서 누구와의 약속이든 갑작스럽게 바뀌면 아쉬움보다 먼저 존중받지 못했다는 느낌이 올 수 있어요. 그 기준은 관계를 성실하게 지키는 힘이지만, 피치 못할 사정까지 마음의 크기로 번역하지 않도록 사건과 사람을 잠시 나누어 보는 연습도 도움이 됩니다.',withdraw:'당신은 불편한 마음을 바로 꺼내기보다 다음 행동을 줄이며 관계의 온도를 조절합니다. 상대를 공격하지 않고 나를 보호하는 방법이지만, 상대는 무엇이 달라졌는지 알지 못한 채 같은 실수를 반복할 수 있어요. 멀어지기 전에 한 번만, “괜찮다고 했지만 사실은 조금 서운했어”라고 알려주는 건 어떨까요?'};
    return same[friendChoice]||'친구와 연인에게 비슷한 기준을 적용하는 편입니다. 관계가 가까워져도 판단의 기준이 크게 흔들리지 않는다는 뜻일 수 있어요.';
  }
  if(friendChoice==='reason'&&loverChoice==='manners')return '친구에게는 상황을 이해하면 마음을 정리할 수 있지만, 연인의 변경에는 설명만으로 다 담기지 않는 서운함이 생깁니다. 아마 약속 그 자체보다 “나와의 시간을 얼마나 기대했는가”를 확인하고 싶은 마음이 더 큰 것 같아요. 이것은 유난함이 아니라 가까운 관계에 더 많은 의미를 거는 자연스러운 모습입니다. 다만 상대가 그 의미를 추측하게 두기보다, 약속이 왜 중요했는지를 직접 알려주세요. “못 만나서 화가 난 것보다, 나만 기다린 것 같아 서운했어” 같은 말이면 충분합니다.';
  if(friendChoice==='reschedule'&&(loverChoice==='reason'||loverChoice==='manners'))return '친구의 사정은 하나의 일정 변경으로 받아들이지만, 연인의 사정은 관계에 관한 메시지처럼 읽히는 편입니다. 사랑하는 사람의 작은 변화가 크게 느껴지는 것은 그 사람이 중요하기 때문이에요. 그렇지만 중요함과 위험함은 같은 말이 아닙니다. 마음이 급해질 때 “확인된 사실은 약속이 미뤄졌다는 것뿐”이라고 잠시 적어본 뒤, 서운함을 숨기지 않고 물어보세요.';
  if((friendChoice==='manners'||friendChoice==='withdraw')&&loverChoice==='reschedule')return '오히려 연인에게 더 너그러워지는 모습이 보입니다. 가까운 사람에게는 피곤함과 사정을 오래 헤아려주지만, 친구 관계에서는 약속과 예의를 분명히 지키고 싶은 것 같아요. 사랑할수록 잘 이해해주는 것은 따뜻한 능력이지만, 내 시간을 양보하는 일이 익숙해져 서운함을 늦게 발견하지는 않는지 살펴봐 주세요.';
  if(loverChoice==='withdraw')return '친구에게는 이유를 묻거나 서운함을 표현할 수 있지만, 연인에게는 괜찮다고 한 뒤 조용히 마음을 거두는 쪽을 택했습니다. 가까운 사람에게 속마음을 말하는 일이 오히려 더 위험하게 느껴질 수도 있어요. 거절당하거나 예민하다는 말을 들을까 봐 미리 물러나는 것이지요. 그러나 상대에게 아무 단서도 주지 않은 거리 두기는 두 사람 모두를 오래 추측하게 합니다. 크게 털어놓지 않아도 괜찮아요. “지금은 조금 서운해서, 내일 다시 얘기하고 싶어” 정도면 충분합니다.';
  return '친구와 연인 앞에서 같은 사건을 다르게 받아들이는 모습이 보입니다. 가까운 관계에는 기대와 두려움이 함께 커지기 때문에, 평소의 기준만으로 설명되지 않는 반응이 나올 수 있어요. 어느 쪽이 진짜 나인지 고를 필요는 없습니다. 다만 연인 앞에서 커지는 마음이 무엇을 지키려는 것인지—연결인지, 존중인지, 안전인지—이름을 붙여보면 다음 대화가 조금 쉬워질 거예요.';
}

function buildDeepInsights(a){
  const cards=[];
  const clearBoundary=['clear','explain'].includes(a.boundary)&&['boundary','decline','limit'].includes(a.loveBoundary||a.moneyLove);
  if(clearBoundary){
    cards.push({title:'강점 · 다정함과 경계를 함께 놓을 줄 알아요',body:'당신은 거절을 관계의 단절로 만들기보다, 내가 할 수 있는 범위를 설명하고 가능한 다른 길을 찾는 편입니다. 부탁을 무조건 들어주는 것만이 배려는 아니라는 사실을 이미 어느 정도 알고 있는 것 같아요. 이 능력은 가까운 사이일수록 더 귀합니다. 다만 설명이 길어질수록 상대가 거절을 협상의 시작으로 받아들일 수도 있어요. 충분한 이유를 증명해야만 “안 돼”라고 말할 수 있는 것은 아닙니다. “여기까지는 가능하지만 그 이상은 어려워”라는 짧은 문장도 완전한 대답이에요.'});
  }else{
    cards.push({title:'살펴볼 점 · 잘 맞춰주는 동안 내 한계가 늦게 도착할 수 있어요',body:'당신은 상대가 실망하는 장면을 피하기 위해 그 순간의 불편을 먼저 감수하는 편일 수 있습니다. 이것은 관계를 소중히 여기는 마음에서 시작하지만, 오래 반복되면 어느 날 갑자기 지치거나 연락을 줄이는 방식으로 경계가 나타날 수 있어요. 거절은 상대를 밀어내는 일이 아니라 관계가 감당할 수 있는 범위를 알려주는 일입니다. 작은 부탁부터 “오늘은 어렵고, 이 정도라면 가능해”라고 말해보세요. 서운함을 견디는 힘도 친밀감의 일부입니다.'});
  }
  if(['clarify','apologize'].includes(a.loveMisunderstanding)&&['clarify','private'].includes(a.publicMisunderstanding)){
    cards.push({title:'강점 · 오해가 생겨도 관계로 돌아오는 길을 찾아요',body:'당신은 오해를 받았을 때 누가 잘못했는지만 따지기보다, 어디에서 말이 어긋났는지 확인하려는 편입니다. 설명과 사과를 관계를 지는 행위로 느끼지 않는다는 뜻이기도 해요. 덕분에 갈등이 생겨도 대화의 문을 다시 열 가능성이 높습니다. 다만 상대의 모든 불편을 내 책임으로 떠안지는 마세요. “그렇게 들렸다면 미안해” 다음에는 “내가 전하고 싶었던 뜻은 이것이었어”라는 내 자리도 함께 남겨두어야 합니다.'});
  }
  if(a.support==='hold'||a.vulnerability==='minimize'){
    cards.push({title:'살펴볼 점 · 힘든 날에도 내가 민폐가 되지 않을지 먼저 계산해요',body:'상대가 지쳐 보이거나 분위기가 무거우면, 내 마음은 조금 더 견딜 수 있다고 뒤로 미루는 편 같아요. 배려심이 큰 사람에게 흔히 생기는 일입니다. 하지만 늘 괜찮은 사람으로 남으면 가까운 사람조차 당신이 언제 도움이 필요한지 알기 어렵습니다. 마음을 전부 쏟아놓을 필요는 없어요. “해결해주지 않아도 돼. 오늘 십 분만 내 이야기를 들어줄 수 있어?”처럼 필요한 도움의 크기를 알려주세요. 기대는 일은 누군가를 소모시키는 행동이 아니라, 관계에 참여할 자리를 건네는 일이기도 합니다.'});
  }else{
    cards.push({title:'강점 · 필요한 순간에 관계를 자원으로 사용할 수 있어요',body:'당신은 힘든 마음을 혼자 견디는 것만이 성숙함이라고 여기지는 않는 것 같아요. 상대의 여유를 살피면서도 도움을 요청하거나, 말이 어렵다면 다른 방식으로 표현할 줄 압니다. 사람은 혼자 회복할 때도 있지만 안전한 관계 안에서 더 빠르게 제자리로 돌아오기도 해요. 이 강점을 지키려면 상대가 언제나 같은 방식으로 반응할 수 없다는 점도 함께 기억하면 좋습니다. 한 사람에게 모든 돌봄을 맡기기보다 여러 회복 통로를 만들어 두세요.'});
  }
  if(a.anxiety>=60){
    cards.push({title:'살펴볼 점 · 불확실한 순간에는 사실보다 의미가 먼저 커질 수 있어요',body:'연락의 간격, 애정 표현의 변화, 말투처럼 작은 단서가 보이면 당신의 마음은 빠르게 이유를 찾기 시작합니다. 관계를 섬세하게 읽는 능력이지만, 정보가 부족할 때는 가장 두려운 이야기가 빈칸을 채우기도 해요. 그때 자신에게 “지금 확인된 사실은 무엇이고, 내가 추측한 것은 무엇인가”라고 물어보세요. 그리고 확인은 한 번, 구체적으로 해보세요. 확신을 얻을 때까지 질문을 반복하는 것보다 “요즘 표현이 줄어 나는 조금 불안해. 네 상태가 어떤지 듣고 싶어”라는 한 문장이 더 가까운 답을 데려올 수 있습니다.'});
  }else{
    cards.push({title:'강점 · 작은 변화 하나로 관계 전체를 결론 내리지 않아요',body:'당신은 상대의 연락이나 표현이 잠시 달라져도 곧바로 사랑의 크기로 번역하지 않는 편입니다. 상황을 더 지켜보거나 필요한 때 직접 묻는 여유가 있어요. 이 안정감은 두 사람 모두 숨 쉴 공간을 만들어줍니다. 다만 차분함이 언제나 솔직함과 같은 것은 아니에요. 괜찮아서 기다리는 것인지, 기대하지 않으려고 마음을 줄인 것인지 가끔 구분해보세요. 후자라면 서운함도 관계 안에 놓일 자격이 있습니다.'});
  }
  if(a.conflict==='pause'||a.repeatConflict==='agreement'){
    cards.push({title:'강점 · 화해보다 변화가 필요한 순간을 알아봐요',body:'당신은 감정이 커졌을 때 잠시 멈추거나, 반복되는 갈등에는 구체적인 약속이 필요하다는 감각이 있습니다. “미안해”라는 말만 주고받는 것보다 다음번에 무엇을 다르게 할지를 정하는 사람이에요. 관계를 실제로 바꾸는 것은 이런 작고 측정 가능한 합의입니다. 다음 대화에서는 “잘해볼게” 대신 누가, 언제, 무엇을 할지 한 가지만 정해보세요. 그리고 지켜지지 않았을 때 벌을 주기보다 합의가 현실적이었는지 다시 조정하면 좋겠습니다.'});
  }else if(a.conflict==='follow'){
    cards.push({title:'살펴볼 점 · 지금 끝내야 안심될 것 같은 대화가 있어요',body:'갈등 중 상대가 멈추려 하면 해결되지 않은 채 혼자 남겨지는 기분이 들 수 있습니다. 그래서 지금 결론을 내야만 마음이 가라앉을 것 같고요. 하지만 감정이 높은 두 사람이 오래 대화한다고 언제나 더 정확해지는 것은 아닙니다. 중단을 이별처럼 느끼지 않으려면 종료 시점이 아니라 재개 시점을 합의하세요. “지금은 멈추되 오늘 밤 아홉 시에 다시 이야기하자”는 약속은 연결을 포기하지 않으면서도 서로의 신경계를 쉬게 합니다.'});
  }else{
    cards.push({title:'살펴볼 점 · 조용히 멈춘 대화가 저절로 해결되기를 기다릴 수 있어요',body:'갈등이 커지면 말을 더 보태기보다 거리를 두어 상황을 진정시키는 편일 수 있습니다. 불필요한 상처를 줄이는 현명한 멈춤이기도 해요. 다만 두 사람이 모두 기다리는 사람이라면 침묵은 휴식이 아니라 단절이 됩니다. 마음이 정리되지 않았어도 “지금은 어렵지만 내일 다시 이야기하고 싶어”라는 표지판을 남겨주세요. 돌아올 길이 있다는 사실만으로도 침묵의 의미가 달라집니다.'});
  }
  if(a.recovery==='reflect'||a.feedback==='extract'){
    cards.push({title:'강점 · 경험을 그냥 지나치지 않고 내 것으로 만들어요',body:'피드백이나 갈등이 지나간 뒤 무엇이 있었는지 정리하고 다음에 바꿀 지점을 찾는 힘이 있습니다. 아픈 경험에서도 배울 것을 꺼내는 사람은 관계 속에서 조금씩 더 자유로워질 수 있어요. 다만 성찰이 자기 심문으로 변하지 않도록 조심하세요. 모든 갈등에서 내가 더 잘했어야 할 답을 찾을 필요는 없습니다. 기록할 때는 “내가 바꿀 한 가지”와 함께 “내가 책임지지 않아도 될 한 가지”도 나란히 적어보세요.'});
  }
  return cards.slice(0,6);
}

function buildPreferenceInsights(loveOrder,idealBoard,friendBoard){
  const loveNames={time:'함께 보내는 시간',acts:'행동으로 돕는 배려',touch:'스킨십',words:'다정한 말과 칭찬',gift:'기억을 담은 선물'};
  const idealNames={warm:'따뜻한 표현',fun:'웃게 해주는 힘',steady:'꾸준함',independent:'각자의 시간 존중',deep:'깊은 대화',social:'사교성',practical:'경제관념',adventure:'새로운 경험',calm:'감정적 안정',growth:'성장 의지',style:'세련된 스타일',cuteStyle:'귀여운 스타일',sexyStyle:'성숙한 스타일',tallGap:'큰 키 차이',smallGap:'비슷한 키',older:'연상',younger:'연하',voice:'목소리와 말투',music:'음악적 재능',cook:'요리와 식생활',homebody:'집에서 노는 취향',active:'운동과 야외 활동',drinkGood:'음주 취향',noDrink:'비음주 생활',smoker:'흡연 허용',pet:'동물 취향',game:'게임 취향',career:'커리어 열정',money:'경제적 여유',news:'사회 이슈 관심'};
  const boundaryNames={meal:'둘이 저녁 식사',coffee:'둘이 카페',call:'늦은 밤 고민 전화',tripGroup:'여럿이 1박 여행',tripTwo:'둘이 1박 여행',drink:'둘이 술 마시기',movie:'둘이 영화',giftBirthday:'생일 선물',dailyChat:'매일 개인 연락',home:'집에 단둘이 있기',ex:'전 연인과 만나기',secret:'말하지 않고 만나기'};
  const topLove=loveOrder.slice(0,2).map(id=>loveNames[id]).filter(Boolean);
  const must=Object.keys(idealBoard).filter(id=>idealBoard[id]==='must').map(id=>idealNames[id]).filter(Boolean);
  const low=Object.keys(idealBoard).filter(id=>idealBoard[id]==='low').map(id=>idealNames[id]).filter(Boolean);
  const strict=Object.keys(friendBoard).filter(id=>friendBoard[id]==='no').map(id=>boundaryNames[id]);
  const uneasy=Object.keys(friendBoard).filter(id=>friendBoard[id]==='uneasy').map(id=>boundaryNames[id]);
  const loveText=topLove.length?`당신은 사랑을 느끼는 요소 가운데 ${topLove.map(x=>`‘${x}’`).join('과 ')}을 가장 위에 두었습니다. 이는 거창한 선언보다 관계 안에서 반복해서 체감할 수 있는 신호를 중요하게 여긴다는 뜻일 수 있어요. 상대가 마음은 크다고 말해도 이 요소가 오래 비어 있으면 사랑받지 못한다는 느낌이 들 수 있습니다. 서로의 방식이 다를 때는 “더 사랑해줘”보다 “나는 ${topLove[0]}이 있을 때 마음이 가장 잘 전해져”라고 구체적으로 알려주세요.`:'';
  const idealText=must.length?`이상형 표에서 ${must.slice(0,3).map(x=>`‘${x}’`).join(', ')}을 가장 중요한 칸에 두었네요. ${low.length?`반면 ${low.slice(0,2).map(x=>`‘${x}’`).join(', ')}은 상대적으로 아래에 두었습니다.`:''} 당신이 원하는 것은 조건이 많은 사람이기보다, 관계에서 반복해서 경험하고 싶은 분위기가 분명한 사람에 가까워 보여요. 다만 “끌리는 특징”과 “오래 지내기 위해 필요한 특징”은 다를 수 있습니다. 초반의 매력을 결정하는 것과 갈등 뒤에도 관계를 지탱하는 것을 따로 떠올려보면 취향이 더 선명해질 거예요.`:'';
  const boundaryText=strict.length||uneasy.length?`이성 친구 경계표에서는 ${strict.length?strict.slice(0,3).map(x=>`‘${x}’`).join(', ')+'을 받아들이기 어려운 영역에 두었고, ':''}${uneasy.length?uneasy.slice(0,3).map(x=>`‘${x}’`).join(', ')+'에는 불편함이 남는다고 보았습니다.':''} 이 결과는 당신이 질투가 많다는 판정이 아닙니다. 관계의 안전을 위해 어떤 정보와 합의가 필요한지를 보여주는 초안에 가까워요. 중요한 것은 금지 목록을 전달하는 일이 아니라, 무엇이 불편한지 설명하고 두 사람이 함께 지킬 기준을 협의하는 것입니다. 같은 행동도 숨김 여부, 시간대, 관계의 역사에 따라 의미가 달라질 수 있으니까요.`:'';
  return `${loveText?`<div class="insight"><b>내가 사랑을 알아보는 방식</b><p>${loveText}</p></div>`:''}${idealText?`<div class="insight"><b>이상형 취향표가 보여준 관계의 분위기</b><p>${idealText}</p></div>`:''}${boundaryText?`<div class="insight"><b>이성 친구 경계표가 말해주는 안전의 조건</b><p>${boundaryText}</p></div>`:''}`;
}

function result(){
  const multi=state.answers[0]||[]; const first=(state.answers[1]||[])[0]; const boundary=state.answers[2]; const refusal=state.answers[5]; const loverChoice=state.answers[7]; const empathy=state.answers[4]||50;
  let anxiety=38+(multi.includes('review')?22:0)+(multi.includes('check')?12:0)+(first==='review'?10:0)+(loverChoice==='reason'?12:0)+(loverChoice==='withdraw'?10:0);
  let avoidance=28+(refusal==='space'?18:0)+(first==='continue'?12:0)+(boundary==='delay'?8:0);
  let dailyExpression=boundary==='clear'?72:boundary==='explain'?64:48;
  let loveExpression=refusal==='repair'?76:refusal==='reverse'?66:refusal==='space'?38:48;
  anxiety=Math.min(92,anxiety); avoidance=Math.min(88,avoidance);
  const switchIndex=Math.round((Math.abs(dailyExpression-loveExpression)+Math.abs(50-anxiety/1.5))/2);
  const headline=anxiety>62?'겉으로는 조절하지만, 관계의 변화는 빠르게 감지해요':'상황을 지켜본 뒤 필요한 말을 고르는 편이에요';
  app.innerHTML=layout(`<section class="screen"><div class="result-head"><span class="result-tag">나의 관계 반응 리포트</span><h1>${headline}</h1><p class="lead">하나의 유형보다, 평소와 연애 상황에서 달라지는 반응을 중심으로 정리했어요.</p></div><div class="summary-card"><h3>연애 모드 전환 지수 ${switchIndex}</h3><p>${switchIndex>28?'관계가 불확실해지면 평소보다 감정과 행동의 변화가 뚜렷한 편이에요.':'일상과 연애에서 반응 방식이 비교적 일관된 편이에요.'}</p></div><div class="chart-card"><h3>일상과 연애의 차이</h3><div class="legend"><span><i class="dot" style="background:#739087"></i>일상</span><span><i class="dot" style="background:#13bd7e"></i>연애</span></div>${chartRow('표현의 직접성',dailyExpression,loveExpression)}${chartRow('관계 단서 민감도',44,anxiety)}${chartRow('거리 두기',35,avoidance)}</div><div class="insight strength"><b>강점 · 관계의 미세한 변화를 읽는 힘</b><p>${empathy<35?'상대가 느끼는 불안과 연결 욕구를 빠르게 이해하는 편이에요.':'두 사람의 입장을 함께 고려하고, 바로 결론 내리기보다 맥락을 살피는 힘이 있어요.'}</p></div><div class="insight strength"><b>강점 · 거절 이후의 관계까지 생각해요</b><p>${boundary==='clear'?'가능한 범위를 분명히 하면서도 관계를 끊지 않는 대안을 찾을 수 있어요.':'상대의 반응을 세심하게 살피고 설명을 통해 충돌을 줄이려는 편이에요.'}</p></div><div class="insight watch"><b>살펴볼 점 · 속마음과 표현의 거리</b><p>${anxiety>60?'겉으로 차분하게 답하더라도 속에서는 이유를 찾는 과정이 길어질 수 있어요. 추측과 확인된 사실을 나누어 적어보세요.':'감정을 충분히 정리한 뒤 말하려다 중요한 타이밍을 놓치지 않는지 살펴보세요.'}</p></div><div class="insight watch"><b>살펴볼 점 · 경계의 일관성</b><p>${refusal==='reverse'?'상대가 서운해하면 결정을 번복하는 경향이 있어요. 거절의 이유보다 가능한 범위를 짧게 반복하는 연습이 도움 됩니다.':'거절한 뒤 상대 반응을 책임져야 한다는 압박을 느끼는지 관찰해보세요.'}</p></div><p class="disclaimer">이 결과는 체험용 문항에 기반한 자기이해 자료입니다. 정신건강 상태를 진단하거나 공식 MBTI® 유형을 판정하지 않습니다.</p><button class="secondary restart" onclick="start()">다시 해보기</button></section>`);
  window.scrollTo(0,0);
}
function chartRow(title,daily,love){return `<div class="chart-row"><div class="chart-title"><span>${title}</span><span>${daily} / ${love}</span></div><div class="bars"><div class="bar"><span class="daily" style="width:${daily}%"></span></div><div class="bar"><span class="love" style="width:${love}%"></span></div></div></div>`}

home();
