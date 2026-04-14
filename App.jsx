import { useState, useEffect, useRef } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer } from "recharts";

// ── Constants ─────────────────────────────────────────────────────────────────
const CALORIE_MAX = 1400;
const CALORIE_TARGET = 1375;
const WATER_GOAL = 2250;
const START_WEIGHT = 145;
const GOAL_WEIGHT = 125;

// ── Persistence ───────────────────────────────────────────────────────────────
// localStorage-based persistence — works in real browsers
function save(k, v) {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch(e) {}
}

function load(k, fb) {
  try {
    const r = localStorage.getItem(k);
    if (r != null) return JSON.parse(r);
  } catch(e) {}
  return fb;
}

// Simple sync hydration — localStorage is synchronous so no async needed
function hydrateFromStorage(keys, onDone) {
  // localStorage is already sync — nothing to load asynchronously
  // Just call onDone immediately
  onDone();
}
function todayKey() { return new Date().toISOString().slice(0,10); }



function isDone(d) { return d && Object.values(d.cals||{}).some(v=>parseInt(v)>0) && parseInt(d.steps)>0; }
function calcStreak(set) {
  let cur=0; const d=new Date(todayKey());
  for(let i=0;i<365;i++){
    if(set.has(d.toISOString().slice(0,10))){ cur++; d.setDate(d.getDate()-1); } else break;
  }
  const s=[...set].sort(); let best=0,run=0;
  for(let i=0;i<s.length;i++){ if(i===0){run=1;continue;} run=(new Date(s[i])-new Date(s[i-1]))/86400000===1?run+1:1; if(run>best)best=run; }
  return { cur, best: Math.max(best,cur) };
}

// ── Plan data ─────────────────────────────────────────────────────────────────
const SCHEDULE = [
  { day:"Sun", name:"Sunday",    session:"Run + Upper Body",       time:"Flexible", type:"mix",   dur:"45 min",    icon:"🏃‍♀️", color:"#E8643A" },
  { day:"Mon", name:"Monday",    session:"Full Body Strength",     time:"6:30–7pm", type:"lift",  dur:"45 min",    icon:"💪",    color:"#3B7DD8" },
  { day:"Tue", name:"Tuesday",   session:"HIIT Cardio",            time:"6:30–7pm", type:"opt",   dur:"30 min",    icon:"⚡",    color:"#F0A500" },
  { day:"Wed", name:"Wednesday", session:"Lower Body Strength",    time:"6:30–7pm", type:"lift",  dur:"45 min",    icon:"🦵",    color:"#7C3AED" },
  { day:"Thu", name:"Thursday",  session:"Rest Day",               time:"—",        type:"rest",  dur:"—",         icon:"😴",    color:"#94A3B8" },
  { day:"Fri", name:"Friday",    session:"Active Cardio",          time:"Flexible", type:"cardio",dur:"45–60 min", icon:"🚴‍♀️", color:"#16A34A" },
  { day:"Sat", name:"Saturday",  session:"Rest Day",               time:"—",        type:"rest",  dur:"—",         icon:"😴",    color:"#94A3B8" },
];
const WORKOUTS = {
  sunday: { title:"Run + Upper Body", sub:"20 min run + 25 min weights", color:"#E8643A", accent:"#FFF0EB",
    sections:[{ name:"Run (20 min)", ex:[{id:"s1",n:"Warm-up walk/jog",d:"5 min"},{id:"s2",n:"Steady run",d:"10 min"},{id:"s3",n:"Cool-down walk",d:"5 min + stretch"}]},
    { name:"Upper Body — 3×10–12", ex:[{id:"s4",n:"Push-ups / Chest Press",d:"3×10–12"},{id:"s5",n:"Dumbbell Rows",d:"3×10–12 each"},{id:"s6",n:"Shoulder Press",d:"3×10–12"},{id:"s7",n:"Lat Pulldown",d:"3×12"},{id:"s8",n:"Bicep Curls",d:"3×12"},{id:"s9",n:"Tricep Dips",d:"3×12"},{id:"s10",n:"Plank",d:"3×40 sec"}]}]},
  monday: { title:"Full Body Strength", sub:"3 sets × 10–12 • Rest 60 sec", color:"#3B7DD8", accent:"#EBF2FF",
    sections:[{ name:"Exercises", ex:[{id:"m1",n:"Deadlifts",d:"3×10"},{id:"m2",n:"Dumbbell Chest Press",d:"3×12"},{id:"m3",n:"Goblet Squats",d:"3×12"},{id:"m4",n:"Bent-Over Rows",d:"3×12"},{id:"m5",n:"Overhead Press",d:"3×10–12"},{id:"m6",n:"Reverse Lunges",d:"3×10 each"},{id:"m7",n:"Plank to Shoulder Tap",d:"3×30 sec"}]}]},
  tuesday: { title:"HIIT Cardio (Optional)", sub:"Only if you feel good — skip guilt-free", color:"#F0A500", accent:"#FFF9E6",
    sections:[{ name:"40s work / 20s rest × 4 rounds", ex:[{id:"t1",n:"Warm-up",d:"5 min"},{id:"t2",n:"Jumping Jacks",d:"40s on/20s off"},{id:"t3",n:"Burpees",d:"40s on/20s off"},{id:"t4",n:"Mountain Climbers",d:"40s on/20s off"},{id:"t5",n:"High Knees",d:"40s on/20s off"},{id:"t6",n:"Squat Jumps",d:"40s on/20s off"},{id:"t7",n:"Cool-down",d:"5 min"}]}]},
  wednesday: { title:"Lower Body Strength", sub:"3 sets × 10–12 • Rest 60–90 sec", color:"#7C3AED", accent:"#F3EEFF",
    sections:[{ name:"Exercises", ex:[{id:"w1",n:"Barbell Squats",d:"3×12"},{id:"w2",n:"Romanian Deadlifts",d:"3×12"},{id:"w3",n:"Walking Lunges",d:"3×10 each"},{id:"w4",n:"Leg Press",d:"3×12"},{id:"w5",n:"Glute Bridges",d:"3×15"},{id:"w6",n:"Calf Raises",d:"3×15"},{id:"w7",n:"Leg Raises",d:"3×12"}]}]},
  friday: { title:"Active Cardio", sub:"Pick what you enjoy — make it fun", color:"#16A34A", accent:"#EDFAF2",
    sections:[{ name:"Choose your activity (45–60 min)", ex:[{id:"f1",n:"Outdoor run or jog",d:"Great for steps"},{id:"f2",n:"Cycling",d:"Easy on joints"},{id:"f3",n:"Swimming",d:"Low impact"},{id:"f4",n:"Fitness class",d:"Fun + social"},{id:"f5",n:"Long brisk walk",d:"Counts toward steps"},{id:"f6",n:"A sport you enjoy",d:"Best motivation"}]}]},
};
const MEALS = [
  { id:"lunch", time:"1:00pm", label:"Lunch", target:450, color:"#3B7DD8", bg:"#EBF2FF", ideas:["120g chicken, salmon, or tuna","Large salad: chickpeas, cucumber, avocado","Olive oil + lemon dressing","Wholegrain bread or small rice portion"] },
  { id:"dinner", time:"6–7pm", label:"Dinner", target:550, color:"#7C3AED", bg:"#F3EEFF", ideas:["120g lean protein","Roasted or stir-fried veg","½ cup rice, pasta, or 1 sweet potato"] },
  { id:"snack", time:"8–9pm", label:"Snack", target:275, color:"#E8643A", bg:"#FFF0EB", ideas:["Greek yogurt + berries + honey","Dark chocolate + nuts","Protein shake","Cottage cheese + fruit"] },
];
const HABITS = [
  { id:"water", icon:"💧", label:"2–2.5L water", color:"#3B7DD8" },
  { id:"steps", icon:"👟", label:"10,000 steps", color:"#16A34A" },
  { id:"protein", icon:"🥩", label:"Protein every meal", color:"#E8643A" },
  { id:"window", icon:"🕐", label:"Window 1pm–9/10pm", color:"#F0A500" },
  { id:"sleep", icon:"😴", label:"7–8 hours sleep", color:"#7C3AED" },
];
const DRINKS = [
  { name:"Gin & slimline tonic", cal:"~65", r:5 },
  { name:"Vodka & soda water", cal:"~65", r:5 },
  { name:"Dry white wine (125ml)", cal:"~85", r:4 },
  { name:"Prosecco (125ml)", cal:"~90", r:4 },
  { name:"Light beer (330ml)", cal:"~100", r:4 },
  { name:"Regular beer (330ml)", cal:"~150", r:2 },
  { name:"Red wine (175ml)", cal:"~150", r:2 },
  { name:"Cocktails with mixers", cal:"200–350", r:1 },
];
const DAY_KEYS = ["sunday","monday","tuesday","wednesday","friday"];
const DAY_LABELS = { sunday:"Sun",monday:"Mon",tuesday:"Tue",wednesday:"Wed",friday:"Fri" };
const TABS = ["Today","Progress","Schedule","Workouts","Nutrition","Drinks","Shop"];
const WATER_SIZES = [{label:"150ml",ml:150},{label:"250ml",ml:250},{label:"500ml",ml:500},{label:"750ml",ml:750}];

// ── Custom tooltip ────────────────────────────────────────────────────────────
const ChartTip = ({active,payload}) => {
  if(!active||!payload?.length) return null;
  const w=payload[0]?.value;
  return <div style={{background:"#1a1a2e",border:"none",borderRadius:10,padding:"10px 14px",color:"white"}}>
    <p style={{fontSize:14,fontWeight:700}}>{w} lbs</p>
    {w<START_WEIGHT&&<p style={{fontSize:11,color:"#4ade80"}}>−{(START_WEIGHT-w).toFixed(1)} lbs lost</p>}
  </div>;
};

// ── Main ──────────────────────────────────────────────────────────────────────
// ── Shop categories & auto-detection ─────────────────────────────────────────
const SHOP_CATS = [
  { id:"protein",  label:"🥩 Meat & Fish",     color:"#E8643A", bg:"#FFF0EB" },
  { id:"dairy",    label:"🥛 Dairy & Eggs",     color:"#3B7DD8", bg:"#EBF2FF" },
  { id:"veg",      label:"🥦 Fruit & Veg",      color:"#16A34A", bg:"#F0FDF4" },
  { id:"carbs",    label:"🌾 Bread & Grains",   color:"#F0A500", bg:"#FFF9E6" },
  { id:"tins",     label:"🥫 Tins & Jars",      color:"#7C3AED", bg:"#F3EEFF" },
  { id:"drinks",   label:"💧 Drinks",           color:"#0891B2", bg:"#E0F7FA" },
  { id:"snacks",   label:"🍫 Snacks & Treats",  color:"#EC4899", bg:"#FDF2F8" },
  { id:"other",    label:"🛒 Other",            color:"#94A3B8", bg:"#F8FAFC" },
];

const CAT_KEYWORDS = {
  protein: ["chicken","turkey","beef","steak","mince","salmon","tuna","cod","fish","prawn","shrimp","lamb","pork","bacon","ham","sausage","meat","protein","tofu","tempeh","edamame"],
  dairy:   ["milk","yogurt","yoghurt","cheese","egg","eggs","butter","cream","whey","kefir","cottage","quark","feta","mozzarella","cheddar"],
  veg:     ["apple","banana","berry","berries","strawberry","blueberry","grape","orange","lemon","lime","mango","avocado","spinach","kale","broccoli","pepper","courgette","cucumber","tomato","onion","garlic","carrot","lettuce","salad","mushroom","celery","potato","sweet potato","fruit","veg","vegetable","herb","ginger","chilli"],
  carbs:   ["bread","rice","pasta","oat","oats","quinoa","noodle","wrap","tortilla","bagel","crumpet","cereal","granola","flour","couscous","grain","porridge","rye","sourdough"],
  tins:    ["tin","can","jar","chickpea","lentil","bean","tomato sauce","passata","coconut milk","tuna can","soup","stock","broth","olive","pickle","hummus","pesto","sauce"],
  drinks:  ["water","juice","tea","coffee","milk","smoothie","protein shake","shake","squash","sparkling","coconut water","almond milk","oat milk","soy milk"],
  snacks:  ["chocolate","dark chocolate","nut","nuts","almond","walnut","cashew","peanut","peanut butter","almond butter","rice cake","cracker","bar","snack","popcorn","crisp","biscuit","honey","jam","syrup"],
};

function detectCategory(text) {
  const lower = text.toLowerCase();
  for (const [cat, words] of Object.entries(CAT_KEYWORDS)) {
    if (words.some(w => lower.includes(w))) return cat;
  }
  return "other";
}

const DEFAULT_PLAN = { Sunday:"sunday", Monday:"monday", Tuesday:"tuesday", Wednesday:"wednesday", Thursday:"rest", Friday:"friday", Saturday:"rest" };
const ALL_WORKOUT_OPTIONS = [
  {key:"sunday",  label:"Run + Upper Body",      icon:"🏃‍♀️", color:"#E8643A"},
  {key:"monday",  label:"Full Body Strength",    icon:"💪",         color:"#3B7DD8"},
  {key:"tuesday", label:"HIIT Cardio",           icon:"⚡",          color:"#F0A500"},
  {key:"wednesday",label:"Lower Body Strength", icon:"🦵",          color:"#7C3AED"},
  {key:"friday",  label:"Active Cardio",         icon:"🚴‍♀️", color:"#16A34A"},
  {key:"rest",    label:"Rest Day",              icon:"😴",          color:"#94A3B8"},
];

export default function App() {
  const today = todayKey();
  const [hydrated, setHydrated] = useState(false);
  const [tab, setTab] = useState("Today");
  const [wDay, setWDay] = useState(() => { const entries=Object.entries(load('fp:weekplan', DEFAULT_PLAN)).filter(([,v])=>v!=='rest'); return entries.length>0?entries[0][1]+'::'+entries[0][0]:'monday::Monday'; });

  const [cals, setCals] = useState(() => load("fp:current:cals", {lunch:"",dinner:"",snack:"",extra:""}));
  const [steps, setSteps] = useState(() => load("fp:current:steps", ""));
  const [water, setWater] = useState(() => load("fp:current:water", 0));
  const [habits, setHabits] = useState(() => load("fp:current:habits", {}));
  const [workouts, setWorkouts] = useState(() => load("fp:current:workouts", {}));
  const [checked, setChecked] = useState(() => load("fp:current:checked", {}));
  const [wLog, setWLog] = useState(() => {
    // Load from individual permanent weight keys
    const index = load("fp:weightindex", []);
    const entries = index.map(d => load(`fp:weight:${d}`, null)).filter(Boolean);
    // Also merge any legacy fp:wl entries
    const legacy = load("fp:wl", []);
    const existing = new Set(entries.map(e => e.date));
    const merged = [...entries, ...legacy.filter(e => !existing.has(e.date))];
    return merged.sort((a,b) => a.date.localeCompare(b.date));
  });
  const [wInput, setWInput] = useState("");
  const [wSaved, setWSaved] = useState(false);
  const [showPastWeight, setShowPastWeight] = useState(false);
  const [pastWeightDate, setPastWeightDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate()-1); return d.toISOString().slice(0,10);
  });
  const [pastWeightVal, setPastWeightVal] = useState("");
  const [pastWeightSaved, setPastWeightSaved] = useState(false);
  const [macros, setMacros] = useState(() => load("fp:current:macros", {protein:"",carbs:"",fat:""}));
  const [shopItems, setShopItems] = useState(() => { const raw = load("fp:shop", []); return raw.map(i => ({...i, cat: i.cat || detectCategory(i.text || "")})); });
  const [shopInput, setShopInput] = useState("");
  const [dayHistory, setDayHistory] = useState(() => {
    // Load from individual permanent day keys (fp:day:YYYY-MM-DD)
    const index = load("fp:dayindex", []);
    const days = index.map(date => load(`fp:day:${date}`, null)).filter(Boolean);
    // Also merge any legacy fp:dayhistory entries
    const legacy = load("fp:dayhistory", []);
    const allDates = new Set(days.map(d => d.date));
    const merged = [...days, ...legacy.filter(d => !allDates.has(d.date))];
    return merged.sort((a,b) => b.date.localeCompare(a.date));
  });
  const [finishConfirm, setFinishConfirm] = useState(false);
  const [lockedDays, setLockedDays] = useState(() => new Set(load("fp:locked", [])));
  const [scanResult, setScanResult] = useState(null);
  const [recovering, setRecovering] = useState(false);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [manualDate, setManualDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate()-1); return d.toISOString().slice(0,10);
  });
  const [manualData, setManualData] = useState({
    lunch:"", dinner:"", snack:"", extra:"",
    protein:"", carbs:"", fat:"",
    steps:"", water:"",
    habits: { water:false, steps:false, protein:false, window:false, sleep:false }
  });
  const [manualSaved, setManualSaved] = useState(false);

  const [weekPlan, setWeekPlan] = useState(() => load("fp:weekplan", DEFAULT_PLAN));
  const [editingDay, setEditingDay] = useState(null); // which day is being reassigned

  useEffect(()=>save("fp:weekplan", weekPlan),[weekPlan]);

  function assignWorkout(dayName, workoutKey) {
    setWeekPlan(p => ({ ...p, [dayName]: workoutKey }));
    setEditingDay(null);
  }

  const [compDays, setCompDays] = useState(() => new Set(load("fp:cd", [])));
  const [pop, setPop] = useState(false);
  const prevS = useRef(0);
  const [showImport, setShowImport] = useState(false);
  const [importVal, setImportVal] = useState("98");
  const [importDone, setImportDone] = useState(false);

  function handleImport() {
    const n = parseInt(importVal);
    if (!n || n < 1 || n > 3650) return;
    const next = new Set(compDays);
    for (let i = 1; i <= n; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      next.add(d.toISOString().slice(0, 10));
    }
    setCompDays(next);
    save("fp:cd", [...next]);
    setImportDone(true);
    setTimeout(() => { setShowImport(false); setImportDone(false); }, 2000);
  }

  const todayDone = Object.values(cals).some(v=>parseInt(v)>0) && parseInt(steps)>0;

  useEffect(()=>{ const n=new Set(compDays); if(todayDone||lockedDays.has(today)){n.add(today);}else if(!lockedDays.has(today)){n.delete(today);} setCompDays(n); save("fp:cd",[...n]); },[todayDone]);
  useEffect(()=>save('fp:current:cals',cals),[cals]);
  useEffect(()=>save('fp:current:steps',steps),[steps]);
  useEffect(()=>save('fp:current:water',water),[water]);
  useEffect(()=>save('fp:current:habits',habits),[habits]);
  useEffect(()=>save('fp:current:workouts',workouts),[workouts]);
  useEffect(()=>save('fp:current:checked',checked),[checked]);
  useEffect(()=>save("fp:wl",wLog),[wLog]);
  useEffect(()=>save('fp:current:macros',macros),[macros]);
  useEffect(()=>save("fp:shop",shopItems),[shopItems]);
  useEffect(()=>save("fp:dayhistory",dayHistory),[dayHistory]);
  useEffect(()=>save("fp:locked",[...lockedDays]),[lockedDays]);

  // Hydrate from window.storage on first mount
  useEffect(() => {
    const staticKeys = [
      "fp:current:cals","fp:current:steps","fp:current:water",
      "fp:current:habits","fp:current:workouts","fp:current:checked",
      "fp:current:macros","fp:wl","fp:cd","fp:locked","fp:dayhistory",
      "fp:weekplan","fp:shop","fp:dayindex","fp:weightindex","fp:migrated_v2"
    ];
    hydrateFromStorage(staticKeys, () => {
      // Re-initialise all state from MEM now that it's populated
      setCals(load("fp:current:cals", {lunch:"",dinner:"",snack:"",extra:""}));
      setSteps(load("fp:current:steps", ""));
      setWater(load("fp:current:water", 0));
      setHabits(load("fp:current:habits", {}));
      setWorkouts(load("fp:current:workouts", {}));
      setChecked(load("fp:current:checked", {}));
      setMacros(load("fp:current:macros", {protein:"",carbs:"",fat:""}));
      setCompDays(new Set(load("fp:cd", [])));
      setLockedDays(new Set(load("fp:locked", [])));
      setWeekPlan(load("fp:weekplan", DEFAULT_PLAN));
      setShopItems(() => {
        const raw = load("fp:shop", []);
        return raw.map(i => ({...i, cat: i.cat || detectCategory(i.text || "")}));
      });
      // Reload weight log from individual keys
      const widx = load("fp:weightindex", []);
      const wEntries = widx.map(d => load(`fp:weight:${d}`, null)).filter(Boolean);
      const wLegacy = load("fp:wl", []);
      const wExisting = new Set(wEntries.map(e => e.date));
      const wMerged = [...wEntries, ...wLegacy.filter(e => !wExisting.has(e.date))].sort((a,b)=>a.date.localeCompare(b.date));
      setWLog(wMerged);
      // Reload day history from individual keys
      const didx = load("fp:dayindex", []);
      const dEntries = didx.map(d => load(`fp:day:${d}`, null)).filter(Boolean);
      const dLegacy = load("fp:dayhistory", []);
      const dExisting = new Set(dEntries.map(d => d.date));
      const dMerged = [...dEntries, ...dLegacy.filter(d => !dExisting.has(d.date))].sort((a,b)=>b.date.localeCompare(a.date));
      setDayHistory(dMerged);
      setHydrated(true);
    });
  }, []);

  const {cur:streak, best:bestStreak} = calcStreak(compDays);
  useEffect(()=>{ if(streak>prevS.current&&streak>0){setPop(true);setTimeout(()=>setPop(false),1200);} prevS.current=streak; },[streak]);

  const totalCals = ["lunch","dinner","snack","extra"].reduce((s,k)=>s+(parseInt(cals[k])||0),0);
  const calPct = Math.min((totalCals/CALORIE_MAX)*100,100);
  const calOver = totalCals > CALORIE_MAX;
  const calNear = !calOver && totalCals > CALORIE_TARGET;
  const calGood = !calOver && !calNear && totalCals > 0;
  const stepsNum = parseInt(steps)||0;
  const waterPct = Math.min((water/WATER_GOAL)*100,100);
  const habCount = Object.values(habits).filter(Boolean).length;
  const latestW = wLog.length>0?wLog[wLog.length-1].weight:null;
  const lost = latestW?Math.max(0,START_WEIGHT-latestW):0;
  const progPct = Math.min((lost/(START_WEIGHT-GOAL_WEIGHT))*100,100);
  const toGo = latestW?Math.max(0,latestW-GOAL_WEIGHT).toFixed(1):(START_WEIGHT-GOAL_WEIGHT);
  const chartData = wLog.slice(-20).map(e=>({date:e.label,weight:e.weight}));

  const last7 = Array.from({length:7},(_,i)=>{ const d=new Date(); d.setDate(d.getDate()-(6-i)); const ds=d.toISOString().slice(0,10); return {ds, done:compDays.has(ds)||(ds===today&&todayDone), letter:d.toLocaleDateString("en-GB",{weekday:"short"}).slice(0,1)}; });

  function saveWeight(date, weightStr, onDone) {
    const w = parseFloat(weightStr);
    if (!w || w < 50 || w > 400) return;
    const dateObj = new Date(date + "T12:00:00");
    const label = dateObj.toLocaleDateString("en-GB", { day:"numeric", month:"short", year:"numeric" });
    const entry = { date, weight: w, label };
    // Save to individual permanent key
    save(`fp:weight:${date}`, entry);
    // Update index
    const index = load("fp:weightindex", []);
    const newIndex = [...new Set([date, ...index])].sort();
    save("fp:weightindex", newIndex);
    // Update in-memory log
    const next = [...wLog.filter(e => e.date !== date), entry].sort((a,b) => a.date.localeCompare(b.date));
    setWLog(next);
    if (onDone) onDone();
  }

  function logW() {
    saveWeight(today, wInput, () => { setWInput(""); setWSaved(true); setTimeout(()=>setWSaved(false),2000); });
  }

  function logPastWeight() {
    saveWeight(pastWeightDate, pastWeightVal, () => {
      setPastWeightVal(""); setPastWeightSaved(true);
      setTimeout(() => { setPastWeightSaved(false); setShowPastWeight(false); }, 2000);
    });
  }
  function scanStorage() {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("fp:")) keys.push(k);
    }
    setScanResult(keys);
  }

  function forceRecover() {
    setRecovering(true);
    // Reload from individual permanent keys
    const idx2 = load("fp:dayindex", []);
    const recovered = idx2.map(d => load(`fp:day:${d}`, null)).filter(Boolean);
    const legacy2 = load("fp:dayhistory", []);
    const rdates = new Set(recovered.map(d=>d.date));
    setDayHistory([...recovered, ...legacy2.filter(d=>!rdates.has(d.date))].sort((a,b)=>b.date.localeCompare(a.date)));
    setLockedDays(new Set(load("fp:locked", [])));
    setCompDays(new Set(load("fp:cd", [])));
    setWLog(load("fp:wl", []));
    setCals(load("fp:current:cals", {lunch:"",dinner:"",snack:"",extra:""}));
    setSteps(load("fp:current:steps", ""));
    setWater(load("fp:current:water", 0));
    setHabits(load("fp:current:habits", {}));
    setMacros(load("fp:current:macros", {protein:"",carbs:"",fat:""}));
    setTimeout(() => setRecovering(false), 1500);
  }

  function addShopItem(catOverride) {
    const txt = shopInput.trim();
    if (!txt) return;
    const cat = catOverride || detectCategory(txt);
    const newItem = { id: Date.now(), text: txt, done: false, cat };
    setShopItems(p => [...p, newItem]);
    setShopInput("");
  }
  function toggleShopItem(id) { setShopItems(p => p.map(i => i.id===id ? {...i, done:!i.done} : i)); }
  function deleteShopItem(id) { setShopItems(p => p.filter(i => i.id!==id)); }
  function clearDoneItems() { setShopItems(p => p.filter(i => !i.done)); }

  function saveManualDay() {
    const dateObj = new Date(manualDate + "T12:00:00");
    const dateLabel = dateObj.toLocaleDateString("en-GB", { weekday:"long", day:"numeric", month:"long", year:"numeric" });
    const totalCalsVal = ["lunch","dinner","snack","extra"].reduce((s,k)=>s+(parseInt(manualData[k])||0),0);
    const entry = {
      date: manualDate,
      label: dateLabel,
      cals: { lunch:manualData.lunch, dinner:manualData.dinner, snack:manualData.snack, extra:manualData.extra },
      steps: manualData.steps||"",
      water: parseInt(manualData.water)||0,
      habits: { ...manualData.habits },
      macros: { protein:manualData.protein, carbs:manualData.carbs, fat:manualData.fat },
      totalCals: totalCalsVal,
      finishedAt: new Date().toISOString(),
      manualEntry: true,
    };
    // Save to individual permanent key
    save(`fp:day:${manualDate}`, entry);
    // Update index
    const index = load("fp:dayindex", []);
    const newIndex = [...new Set([manualDate, ...index])].sort((a,b) => b.localeCompare(a));
    save("fp:dayindex", newIndex);
    // Update in-memory history
    const next = [entry, ...dayHistory.filter(d => d.date !== manualDate)].sort((a,b)=>b.date.localeCompare(a.date));
    setDayHistory(next);
    // Lock in streak
    const nextLocked = new Set(lockedDays);
    nextLocked.add(manualDate);
    setLockedDays(nextLocked);
    save("fp:locked", [...nextLocked]);
    const nextDays = new Set(compDays);
    nextDays.add(manualDate);
    setCompDays(nextDays);
    save("fp:cd", [...nextDays]);
    // Reset form
    setManualData({ lunch:"", dinner:"", snack:"", extra:"", protein:"", carbs:"", fat:"", steps:"", water:"", habits:{ water:false, steps:false, protein:false, window:false, sleep:false } });
    setManualSaved(true);
    setTimeout(() => { setManualSaved(false); setShowManualEntry(false); }, 2000);
  }

  function finishDay() {
    const dateLabel = new Date().toLocaleDateString("en-GB", { weekday:"long", day:"numeric", month:"long", year:"numeric" });
    const totalCalsVal = ["lunch","dinner","snack","extra"].reduce((s,k)=>s+(parseInt(cals[k])||0),0);
    const entry = {
      date: today,
      label: dateLabel,
      cals: { ...cals },
      steps: steps||"",
      water: water||0,
      habits: { ...habits },
      workouts: { ...workouts },
      macros: { ...macros },
      totalCals: totalCalsVal,
      finishedAt: new Date().toISOString(),
    };

    // Save to its own permanent individual key — this never gets overwritten or purged
    save(`fp:day:${today}`, entry);

    // Update the day index (list of all finished dates)
    const index = load("fp:dayindex", []);
    const newIndex = [...new Set([today, ...index])].sort((a,b) => b.localeCompare(a));
    save("fp:dayindex", newIndex);

    // Update in-memory history
    const next = [entry, ...dayHistory.filter(d => d.date !== today)];
    setDayHistory(next);

    // Lock streak permanently
    const nextLocked = new Set(lockedDays);
    nextLocked.add(today);
    setLockedDays(nextLocked);
    save("fp:locked", [...nextLocked]);
    const nextDays = new Set(compDays);
    nextDays.add(today);
    setCompDays(nextDays);
    save("fp:cd", [...nextDays]);

    // Clear current tracker
    setCals({lunch:"",dinner:"",snack:"",extra:""});
    setSteps(""); setWater(0); setHabits({}); setWorkouts({}); setMacros({protein:"",carbs:"",fat:""});
    ['fp:current:cals','fp:current:steps','fp:current:water','fp:current:habits',
     'fp:current:workouts','fp:current:checked','fp:current:macros'].forEach(k => {
      try { localStorage.removeItem(k); } catch(e) {}
    });
    setFinishConfirm(false);
  }

  function reset() {
    const empty = {lunch:"",dinner:"",snack:"",extra:""};
    setCals(empty); setSteps(""); setWater(0); setHabits({}); setWorkouts({}); setChecked({}); setMacros({protein:"",carbs:"",fat:""});
    // Clear from storage so they don't reload on next open
    ['fp:current:cals','fp:current:steps','fp:current:water','fp:current:habits','fp:current:workouts','fp:current:checked','fp:current:macros'].forEach(k => {
      try { localStorage.removeItem(k); } catch(e) {}
    });
  }

  if (!hydrated) return (
    <div style={{fontFamily:"'DM Mono',monospace",background:"#F5F0E8",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:16}}>
      <div style={{fontSize:40}}>🏋️‍♀️</div>
      <p style={{fontFamily:"'Syne',sans-serif",fontSize:20,fontWeight:700,color:"#1a1a2e"}}>Loading your plan...</p>
      <p style={{fontSize:12,fontFamily:"'DM Mono'",color:"#a0a0b0"}}>Restoring your saved data</p>
    </div>
  );

  return (
    <div style={{fontFamily:"'DM Mono',monospace",background:"#F5F0E8",minHeight:"100vh",color:"#1a1a2e"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Syne:wght@700;800&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:0}
        input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none}
        .inp{outline:none;background:rgba(255,255,255,0.6);border:2px solid rgba(26,26,46,0.1);border-radius:12px;padding:10px 12px;font-size:15px;font-family:'DM Mono',monospace;color:#1a1a2e;width:100%;transition:all 0.2s}
        .inp:focus{background:white;border-color:#3B7DD8;box-shadow:0 0 0 3px rgba(59,125,216,0.15)}
        .inp::placeholder{color:#a0a0b0}
        .btn{cursor:pointer;border:none;font-family:'DM Mono',monospace;transition:all 0.18s}
        .btn:hover{transform:translateY(-1px)} .btn:active{transform:scale(0.96)}
        .tab{cursor:pointer;border:none;background:none;font-family:'Syne',sans-serif;font-weight:700;transition:all 0.18s;white-space:nowrap}
        .row{cursor:pointer;user-select:none;transition:all 0.15s}
        .row:hover{background:rgba(255,255,255,0.5)!important}
        @keyframes pop{0%{transform:scale(0.3) rotate(-10deg);opacity:0}60%{transform:scale(1.3) rotate(3deg)}100%{transform:scale(1) rotate(0);opacity:1}}
        @keyframes slideIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        .pop{animation:pop 0.5s cubic-bezier(0.34,1.56,0.64,1) forwards}
        .slide{animation:slideIn 0.3s ease forwards}
        .blob1{position:absolute;width:220px;height:220px;border-radius:50%;background:radial-gradient(circle,#E8643A88,transparent 70%);top:-40px;right:-40px;pointer-events:none}
        .blob2{position:absolute;width:180px;height:180px;border-radius:50%;background:radial-gradient(circle,#3B7DD855,transparent 70%);bottom:20px;left:-30px;pointer-events:none}
      `}</style>

      {/* ── HERO HEADER ── */}
      <div style={{background:"#1a1a2e",padding:"24px 20px 0",position:"relative",overflow:"hidden"}}>
        <div className="blob1"/>
        <div className="blob2"/>
        <div style={{maxWidth:720,margin:"0 auto",position:"relative",zIndex:1}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16}}>
            <div>
              <p style={{fontSize:10,letterSpacing:4,textTransform:"uppercase",color:"rgba(255,255,255,0.4)",marginBottom:4,fontFamily:"'DM Mono'"}}>Your Plan</p>
              <h1 style={{fontFamily:"'Syne',sans-serif",fontSize:32,fontWeight:800,color:"white",lineHeight:1,letterSpacing:"-0.02em"}}>Fitness &<br/>Nutrition</h1>
            </div>
            {streak>0?(
              <div className={pop?"pop":""} style={{background:"linear-gradient(135deg,#ff6b35,#f7931e)",borderRadius:16,padding:"10px 14px",textAlign:"center",boxShadow:"0 8px 24px rgba(255,107,53,0.4)"}}>
                <div style={{fontSize:22,lineHeight:1}}>{"🔥".repeat(Math.min(streak,5))}</div>
                <div style={{fontFamily:"'Syne'",fontSize:11,color:"white",fontWeight:700,marginTop:3}}>{streak}d streak</div>
              </div>
            ):(
              <div style={{background:"rgba(255,255,255,0.08)",borderRadius:16,padding:"10px 14px",textAlign:"center",border:"1px dashed rgba(255,255,255,0.2)"}}>
                <div style={{fontSize:20}}>🔥</div>
                <div style={{fontFamily:"'Syne'",fontSize:11,color:"rgba(255,255,255,0.4)",fontWeight:700,marginTop:3}}>start streak</div>
              </div>
            )}
          </div>

          {/* Stat pills */}
          <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:20}}>
            {[{l:"BMR",v:"1,335 cal"},{l:"Target",v:"1,400 cal"},{l:"Goal",v:`${GOAL_WEIGHT} lbs`},{l:"IF Window",v:"1pm–9pm"}].map(s=>(
              <div key={s.l} style={{background:"rgba(255,255,255,0.1)",borderRadius:20,padding:"5px 12px",border:"1px solid rgba(255,255,255,0.15)"}}>
                <span style={{fontSize:9,color:"rgba(255,255,255,0.45)",letterSpacing:2,textTransform:"uppercase",fontFamily:"'DM Mono'"}}>{s.l} </span>
                <span style={{fontSize:12,color:"white",fontFamily:"'DM Mono'",fontWeight:500}}>{s.v}</span>
              </div>
            ))}
          </div>

          {/* Tab bar */}
          <div style={{display:"flex",gap:0,overflowX:"auto",borderTop:"1px solid rgba(255,255,255,0.1)"}}>
            {TABS.map(t=>(
              <button key={t} className="tab" onClick={()=>setTab(t)}
                style={{padding:"12px 14px",fontSize:12,letterSpacing:1,textTransform:"uppercase",
                  color:tab===t?"#F5F0E8":"rgba(255,255,255,0.35)",
                  borderBottom:tab===t?"2px solid #E8643A":"2px solid transparent"}}>
                {t}{t==="Today"&&streak>0?` 🔥${streak}`:""}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── CONTENT ── */}
      <div style={{maxWidth:720,margin:"0 auto",padding:"20px 15px 80px"}}>

        {/* ════════ TODAY ════════ */}
        {tab==="Today"&&(
          <div className="slide">
            {/* Streak card */}
            <div style={{background: streak>0?"linear-gradient(135deg,#1a1a2e,#2d1b4e)":"white",
              borderRadius:20,padding:18,marginBottom:16,
              border: streak===0?"2px dashed #e2ddd5":"none",
              boxShadow: streak>0?"0 12px 40px rgba(26,26,46,0.3)":"none"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                <div>
                  <p style={{fontFamily:"'Syne'",fontSize:18,fontWeight:700,color:streak>0?"white":"#1a1a2e",marginBottom:3}}>Daily Streak 🔥</p>
                  <p style={{fontSize:12,color:streak>0?"rgba(255,255,255,0.55)":"#9090a0",fontFamily:"'DM Mono'"}}>
                    {streak===0?"Log cals + steps to start":streak<3?`${streak} day${streak>1?"s":""} in a row — nice!`:streak<7?`${streak} days — you're on fire!`:`${streak} days — UNSTOPPABLE 🏆`}
                  </p>
                </div>
              </div>
              {/* 7-day dots */}
              <div style={{display:"flex",gap:6,marginBottom:14}}>
                {last7.map(({ds,done,letter})=>(
                  <div key={ds} style={{flex:1,textAlign:"center"}}>
                    <div style={{fontSize:9,marginBottom:4,color:streak>0?"rgba(255,255,255,0.4)":"#b0b0c0",fontFamily:"'DM Mono'",letterSpacing:1}}>{letter}</div>
                    <div style={{width:"100%",aspectRatio:"1",borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,
                      background: done?(streak>0?"linear-gradient(135deg,#ff6b35,#f7931e)":"#E8643A"): streak>0?"rgba(255,255,255,0.08)":"#f0ece4",
                      border: ds===today?`2px solid ${streak>0?"white":"#E8643A"}`:"2px solid transparent",
                      boxShadow: done?"0 3px 10px rgba(232,100,58,0.4)":"none"}}>
                      {done?"🔥":""}
                    </div>
                  </div>
                ))}
              </div>
              {bestStreak>0&&(
                <div style={{display:"flex",justifyContent:"space-between",padding:"10px 12px",borderRadius:12,background:streak>0?"rgba(255,255,255,0.08)":"#faf5ee",border:`1px solid ${streak>0?"rgba(255,255,255,0.1)":"#e8e0d4"}`}}>
                  <span style={{fontSize:11,color:streak>0?"rgba(255,255,255,0.5)":"#909090",fontFamily:"'DM Mono'"}}>Best streak</span>
                  <span style={{fontSize:12,fontWeight:500,color:streak>0?"white":"#1a1a2e",fontFamily:"'DM Mono'"}}>{bestStreak} days {"🔥".repeat(Math.min(bestStreak,5))}</span>
                </div>
              )}
              {!todayDone&&(
                <div style={{marginTop:10,padding:"8px 12px",borderRadius:10,background:streak>0?"rgba(232,100,58,0.2)":"#fff4ee",border:`1px solid ${streak>0?"rgba(232,100,58,0.3)":"#f0c4a0"}`,fontSize:12,fontFamily:"'DM Mono'",color:streak>0?"#ffb090":"#c04010"}}>
                  ⚡ Log calories + steps to {streak>0?"keep streak alive":"start your streak"}
                </div>
              )}

              {/* Import existing streak */}
              <div style={{marginTop:10}}>
                {!showImport?(
                  <button className="btn" onClick={()=>setShowImport(true)}
                    style={{width:"100%",padding:"9px 14px",borderRadius:12,fontSize:11,fontFamily:"'DM Mono'",letterSpacing:1,
                      background:"transparent",border:`1px dashed ${streak>0?"rgba(255,255,255,0.25)":"#d0c8bc"}`,
                      color:streak>0?"rgba(255,255,255,0.45)":"#b0a898"}}>
                    + IMPORT EXISTING STREAK
                  </button>
                ):(
                  <div style={{background:streak>0?"rgba(255,255,255,0.08)":"#faf5ee",borderRadius:14,padding:14,border:`1px solid ${streak>0?"rgba(255,255,255,0.15)":"#e8e0d4"}`}}>
                    <p style={{fontFamily:"'Syne'",fontSize:14,fontWeight:700,color:streak>0?"white":"#1a1a2e",marginBottom:4}}>Import existing streak 🔥</p>
                    <p style={{fontSize:11,fontFamily:"'DM Mono'",color:streak>0?"rgba(255,255,255,0.5)":"#a0a0b0",marginBottom:12,lineHeight:1.5}}>
                      How many consecutive days have you already been tracking in another app? We'll backfill those dates so your streak is accurate.
                    </p>
                    <div style={{display:"flex",gap:8,marginBottom:10}}>
                      <input type="number" value={importVal} onChange={e=>setImportVal(e.target.value)}
                        placeholder="e.g. 98"
                        style={{flex:1,outline:"none",border:`1.5px solid ${streak>0?"rgba(255,255,255,0.2)":"#d8d0c8"}`,borderRadius:10,padding:"9px 12px",
                          fontSize:15,fontFamily:"'DM Mono'",background:streak>0?"rgba(255,255,255,0.1)":"white",
                          color:streak>0?"white":"#1a1a2e"}}/>
                      <span style={{alignSelf:"center",fontSize:12,fontFamily:"'DM Mono'",color:streak>0?"rgba(255,255,255,0.5)":"#a0a0b0",flexShrink:0}}>days</span>
                    </div>
                    <div style={{display:"flex",gap:8}}>
                      <button className="btn" onClick={handleImport}
                        style={{flex:1,padding:"10px",borderRadius:10,fontSize:12,fontFamily:"'DM Mono'",fontWeight:500,letterSpacing:1,
                          background:importDone?"#16a34a":"linear-gradient(135deg,#ff6b35,#f7931e)",
                          color:"white",boxShadow:importDone?"0 4px 12px rgba(22,163,74,0.4)":"0 4px 12px rgba(255,107,53,0.4)"}}>
                        {importDone?`✓ ${parseInt(importVal)||0}+ DAYS ADDED!`:"ADD TO STREAK"}
                      </button>
                      <button className="btn" onClick={()=>setShowImport(false)}
                        style={{padding:"10px 14px",borderRadius:10,fontSize:12,fontFamily:"'DM Mono'",
                          background:"transparent",border:`1px solid ${streak>0?"rgba(255,255,255,0.2)":"#d8d0c8"}`,
                          color:streak>0?"rgba(255,255,255,0.5)":"#a0a0b0"}}>
                        CANCEL
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Calorie tracker */}
            <BigCard label="CALORIES" accent="#3B7DD8" right={
              <div style={{textAlign:"right"}}>
                <span style={{fontFamily:"'Syne'",fontSize:28,fontWeight:800,color:calOver?"#ef4444":calNear?"#f59e0b":totalCals>0?"#16a34a":"#1a1a2e"}}>{totalCals||"—"}</span>
                <span style={{fontSize:13,color:"#9090a0",fontFamily:"'DM Mono'"}}> / {CALORIE_MAX}</span>
              </div>
            }>
              {/* Segmented progress bar */}
              <div style={{display:"flex",gap:3,marginBottom:14}}>
                {[...Array(14)].map((_,i)=>{
                  const seg=(i+1)/14*100;
                  return <div key={i} style={{flex:1,height:8,borderRadius:4,background:calPct>=seg?(calOver?"#ef4444":calNear?"#f59e0b":"#3B7DD8"):"rgba(59,125,216,0.12)",transition:"background 0.4s"}}/>
                })}
              </div>
              {MEALS.map(m=>(
                <div key={m.id} style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                  <div style={{width:10,height:10,borderRadius:3,background:m.color,flexShrink:0}}/>
                  <span style={{fontSize:12,fontFamily:"'DM Mono'",color:"#606070",width:50,flexShrink:0}}>{m.label}</span>
                  <input className="inp" type="number" placeholder={`~${m.target}`} value={cals[m.id]} onChange={e=>setCals(p=>({...p,[m.id]:e.target.value}))} style={{flex:1}}/>
                  <span style={{fontSize:11,color:"#a0a0b0",flexShrink:0}}>cal</span>
                </div>
              ))}
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
                <div style={{width:10,height:10,borderRadius:3,background:"#CBD5E1",flexShrink:0}}/>
                <span style={{fontSize:12,fontFamily:"'DM Mono'",color:"#606070",width:50,flexShrink:0}}>Other</span>
                <input className="inp" type="number" placeholder="Extras, drinks…" value={cals.extra} onChange={e=>setCals(p=>({...p,extra:e.target.value}))} style={{flex:1}}/>
                <span style={{fontSize:11,color:"#a0a0b0",flexShrink:0}}>cal</span>
              </div>
              {totalCals>0&&(
                <div style={{padding:"10px 14px",borderRadius:12,fontSize:12,fontFamily:"'DM Mono'",fontWeight:500,
                  background:calOver?"#fef2f2":calNear?"#fffbeb":"#f0fdf4",
                  color:calOver?"#dc2626":calNear?"#d97706":"#16a34a",
                  border:`1.5px solid ${calOver?"#fecaca":calNear?"#fed7aa":"#bbf7d0"}`}}>
                  {calOver?`⚠️ ${totalCals-CALORIE_MAX} cal over target`:calNear?`Almost there — ${CALORIE_MAX-totalCals} cal left`:`✓ On track — ${CALORIE_MAX-totalCals} cal remaining`}
                </div>
              )}
            </BigCard>


            {/* Macro Tracker */}
            {(()=>{
              const prot = parseInt(macros.protein)||0;
              const carb = parseInt(macros.carbs)||0;
              const fat  = parseInt(macros.fat)||0;
              const protPct = Math.min((prot/120)*100,100);
              const protColor = prot>=100?"#16a34a":prot>=70?"#f59e0b":"#E8643A";
              const protStatus = prot>=120?"🎯 Protein goal hit!":prot>=100?"✓ In range — great!":prot>=70?`${120-prot}g to go`:prot>0?`${120-prot}g to go`:"";
              return (
                <BigCard label="MACROS" right={
                  prot>0?<span style={{fontFamily:"'Syne'",fontSize:18,fontWeight:800,color:protColor}}>{prot}g protein</span>:null
                }>
                  {/* Protein — hero macro */}
                  <div style={{background:prot>=100?"#f0fdf4":prot>=70?"#fffbeb":"#fff4ee",borderRadius:14,padding:"12px 14px",marginBottom:14,border:`1.5px solid ${protColor}30`}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <span style={{fontSize:18}}>🥩</span>
                        <div>
                          <p style={{fontFamily:"'Syne'",fontSize:14,fontWeight:700,color:"#1a1a2e"}}>Protein</p>
                          <p style={{fontSize:10,fontFamily:"'DM Mono'",color:"#a0a0b0"}}>TARGET: 100–120g</p>
                        </div>
                      </div>
                      <span style={{fontFamily:"'Syne'",fontSize:24,fontWeight:800,color:protColor}}>{prot||"—"}<span style={{fontSize:12,color:"#a0a0b0",fontWeight:400}}>g</span></span>
                    </div>
                    {/* Segmented protein bar */}
                    <div style={{display:"flex",gap:2,marginBottom:6}}>
                      {[...Array(12)].map((_,i)=>{
                        const seg=(i+1)/12*100;
                        const isTarget = i===9||i===10; // 100-120g range markers
                        return <div key={i} style={{flex:1,height:10,borderRadius:3,position:"relative",
                          background:protPct>=seg?protColor:`${protColor}18`,
                          transition:"background 0.4s",
                          outline:isTarget&&protPct<seg?"1px solid "+protColor+"60":"none"}}/>
                      })}
                    </div>
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:9,fontFamily:"'DM Mono'",color:"#b0a898",marginBottom:6}}>
                      <span>0g</span><span style={{color:protColor,fontWeight:500}}>100g</span><span style={{color:protColor,fontWeight:500}}>120g ✓</span>
                    </div>
                    <input type="number" placeholder="Enter protein (g)"
                      value={macros.protein} onChange={e=>setMacros(p=>({...p,protein:e.target.value}))}
                      style={{outline:"none",border:`1.5px solid ${protColor}40`,borderRadius:10,padding:"9px 12px",fontSize:14,fontFamily:"'DM Mono'",background:"white",color:"#1a1a2e",width:"100%"}}/>
                    {protStatus&&<p style={{fontSize:12,fontFamily:"'DM Mono'",color:protColor,marginTop:7,fontWeight:500}}>{protStatus}</p>}
                  </div>

                  {/* Carbs + Fat */}
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                    {[
                      {key:"carbs",label:"Carbs",icon:"🌾",target:135,color:"#3B7DD8",unit:"g"},
                      {key:"fat",label:"Fat",icon:"🥑",target:48,color:"#7C3AED",unit:"g"},
                    ].map(m=>{
                      const val=parseInt(macros[m.key])||0;
                      const pct=Math.min((val/m.target)*100,100);
                      return (
                        <div key={m.key} style={{background:"white",borderRadius:12,padding:"11px 12px",border:"1.5px solid #f0ece4"}}>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                            <div style={{display:"flex",alignItems:"center",gap:6}}>
                              <span style={{fontSize:15}}>{m.icon}</span>
                              <span style={{fontFamily:"'DM Mono'",fontSize:11,color:"#606070"}}>{m.label}</span>
                            </div>
                            <span style={{fontFamily:"'Syne'",fontSize:16,fontWeight:700,color:val>0?m.color:"#c0b8b0"}}>{val||"—"}<span style={{fontSize:10,color:"#a0a0b0",fontWeight:400}}>g</span></span>
                          </div>
                          <div style={{background:`${m.color}15`,borderRadius:6,height:6,marginBottom:8,overflow:"hidden"}}>
                            <div style={{width:`${pct}%`,height:"100%",background:m.color,borderRadius:6,transition:"width 0.4s"}}/>
                          </div>
                          <input type="number" placeholder={`~${m.target}g`}
                            value={macros[m.key]} onChange={e=>setMacros(p=>({...p,[m.key]:e.target.value}))}
                            style={{outline:"none",border:`1.5px solid ${m.color}30`,borderRadius:8,padding:"7px 10px",fontSize:13,fontFamily:"'DM Mono'",background:"#fafaf5",color:"#1a1a2e",width:"100%"}}/>
                          <p style={{fontSize:9,color:"#b0a898",marginTop:5,fontFamily:"'DM Mono'"}}>TARGET: up to {m.target}g</p>
                        </div>
                      );
                    })}
                  </div>
                </BigCard>
              );
            })()}

            {/* Water */}
            <BigCard label="WATER" accent="#3B7DD8" right={
              <span style={{fontFamily:"'Syne'",fontSize:24,fontWeight:800,color:water>=WATER_GOAL?"#16a34a":water>=1500?"#f59e0b":"#3B7DD8"}}>
                {water>=1000?`${(water/1000).toFixed(1)}L`:`${water}ml`}
              </span>
            }>
              {/* Liquid fill bar */}
              <div style={{background:"rgba(59,125,216,0.1)",borderRadius:12,height:14,marginBottom:12,overflow:"hidden",border:"1.5px solid rgba(59,125,216,0.2)"}}>
                <div style={{width:`${waterPct}%`,height:"100%",background:"linear-gradient(90deg,#3B7DD8,#60a5fa)",borderRadius:12,transition:"width 0.5s ease",boxShadow:"0 0 12px rgba(59,125,216,0.4)"}}/>
              </div>
              <div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:12}}>
                {Array.from({length:9},(_,i)=>(
                  <span key={i} style={{fontSize:18,transition:"opacity 0.3s",opacity:water>=(i+1)*250?1:water>i*250?0.4:0.15}}>💧</span>
                ))}
                <span style={{fontSize:11,color:"#a0a0b0",alignSelf:"center",marginLeft:4,fontFamily:"'DM Mono'"}}>250ml ea.</span>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
                {WATER_SIZES.map(s=>(
                  <button key={s.ml} className="btn" onClick={()=>setWater(p=>Math.min(p+s.ml,5000))}
                    style={{padding:"10px 4px",borderRadius:12,background:"#EBF2FF",color:"#3B7DD8",fontSize:11,fontWeight:500,fontFamily:"'DM Mono'"}}>
                    +{s.label}
                  </button>
                ))}
              </div>
              {water>=WATER_GOAL&&<div style={{marginTop:10,padding:"8px 12px",borderRadius:10,background:"#EBF2FF",color:"#3B7DD8",fontSize:12,fontFamily:"'DM Mono'",fontWeight:500}}>💧 Hydration goal crushed!</div>}
              {water>0&&<button className="btn" onClick={()=>setWater(0)} style={{marginTop:8,fontSize:11,color:"#c0c0d0",background:"none",border:"none",fontFamily:"'DM Mono'"}}>reset water</button>}
            </BigCard>

            {/* Steps */}
            <BigCard label="STEPS" accent="#16A34A" right={
              <span style={{fontFamily:"'Syne'",fontSize:26,fontWeight:800,color:stepsNum>=10000?"#16a34a":stepsNum>=7000?"#f59e0b":"#1a1a2e"}}>
                {stepsNum>0?stepsNum.toLocaleString():"—"}
              </span>
            }>
              <div style={{background:"rgba(22,163,74,0.1)",borderRadius:12,height:12,marginBottom:12,overflow:"hidden",border:"1.5px solid rgba(22,163,74,0.2)"}}>
                <div style={{width:`${Math.min((stepsNum/10000)*100,100)}%`,height:"100%",background:"linear-gradient(90deg,#16a34a,#4ade80)",borderRadius:12,transition:"width 0.5s",boxShadow:"0 0 12px rgba(22,163,74,0.3)"}}/>
              </div>
              <input className="inp" type="number" placeholder="Enter step count" value={steps} onChange={e=>setSteps(e.target.value)}/>
              {stepsNum>0&&stepsNum<10000&&<p style={{fontSize:12,color:"#909090",marginTop:8,fontFamily:"'DM Mono'"}}>{(10000-stepsNum).toLocaleString()} more to go</p>}
              {stepsNum>=10000&&<p style={{fontSize:12,color:"#16a34a",marginTop:8,fontFamily:"'DM Mono'",fontWeight:500}}>🎉 Goal smashed!</p>}
            </BigCard>

            {/* Habits — stacked colourful cards */}
            <div style={{marginBottom:16}}>
              <Label text="DAILY HABITS"/>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {HABITS.map(h=>(
                  <button key={h.id} className="btn" onClick={()=>setHabits(p=>({...p,[h.id]:!p[h.id]}))}
                    style={{display:"flex",alignItems:"center",gap:14,padding:"14px 16px",borderRadius:16,textAlign:"left",
                      background:habits[h.id]?h.color:"white",
                      border:`2px solid ${habits[h.id]?h.color:"#e8e0d4"}`,
                      boxShadow:habits[h.id]?`0 6px 20px ${h.color}40`:"none",
                      transform:habits[h.id]?"translateX(4px)":"none"}}>
                    <div style={{width:24,height:24,borderRadius:8,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",
                      background:habits[h.id]?"rgba(255,255,255,0.3)":"rgba(26,26,46,0.08)",
                      border:`2px solid ${habits[h.id]?"rgba(255,255,255,0.5)":"rgba(26,26,46,0.12)"}`}}>
                      {habits[h.id]&&<span style={{color:"white",fontSize:13,lineHeight:1}}>✓</span>}
                    </div>
                    <span style={{fontSize:15}}>{h.icon}</span>
                    <span style={{fontSize:13,fontFamily:"'DM Mono'",color:habits[h.id]?"white":"#1a1a2e",fontWeight:habits[h.id]?500:400,
                      textDecoration:habits[h.id]?"line-through":"none",opacity:habits[h.id]?0.9:1}}>{h.label}</span>
                    <span style={{marginLeft:"auto",fontSize:11,color:habits[h.id]?"rgba(255,255,255,0.6)":"#c0c0d0",fontFamily:"'DM Mono'"}}>{habCount}/5</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Workouts done — driven by weekPlan */}
            <BigCard label="WORKOUT DONE?">
              <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                {Object.entries(weekPlan).filter(([,wk])=>wk!=="rest").map(([dayName, wk])=>{
                  const wo = WORKOUTS[wk];
                  const color = wo?.color||"#94A3B8";
                  const icon = ALL_WORKOUT_OPTIONS.find(o=>o.key===wk)?.icon||"💪";
                  return (
                    <button key={dayName} className="btn" onClick={()=>setWorkouts(p=>({...p,[dayName]:!p[dayName]}))}
                      style={{padding:"8px 14px",borderRadius:20,fontSize:12,fontFamily:"'DM Mono'",fontWeight:500,
                        background:workouts[dayName]?color:"white",
                        color:workouts[dayName]?"white":"#606070",
                        border:`1.5px solid ${workouts[dayName]?color:"#e8e0d4"}`,
                        boxShadow:workouts[dayName]?`0 4px 12px ${color}40`:"none"}}>
                      {workouts[dayName]?"✓ ":""}{icon} {dayName.slice(0,3)}
                    </button>
                  );
                })}
              </div>
            </BigCard>

            {/* Finish Day / Reset */}
            {!finishConfirm ? (
              <div style={{display:"flex",gap:10}}>
                <button className="btn" onClick={()=>setFinishConfirm(true)}
                  style={{flex:1,padding:"14px",borderRadius:14,background:"linear-gradient(135deg,#1a1a2e,#2d1b4e)",
                    color:"white",fontSize:13,fontFamily:"'DM Mono'",fontWeight:500,letterSpacing:1,
                    boxShadow:"0 6px 20px rgba(26,26,46,0.25)"}}>
                  ✅ FINISH DAY
                </button>
                <button className="btn" onClick={reset}
                  style={{padding:"14px 16px",borderRadius:14,border:"1.5px dashed #d0c8bc",background:"transparent",color:"#b0a898",fontSize:12,fontFamily:"'DM Mono'",letterSpacing:1}}>
                  RESET
                </button>
              </div>
            ) : (
              <div style={{background:"#1a1a2e",borderRadius:16,padding:16}}>
                <p style={{fontFamily:"'Syne'",fontSize:15,fontWeight:700,color:"white",marginBottom:4}}>Finish tracking today?</p>
                <p style={{fontSize:12,fontFamily:"'DM Mono'",color:"rgba(255,255,255,0.55)",marginBottom:14,lineHeight:1.5}}>
                  Your data will be saved under today's date and you can view it anytime in the Progress tab.
                </p>
                <div style={{display:"flex",gap:10}}>
                  <button className="btn" onClick={finishDay}
                    style={{flex:1,padding:"11px",borderRadius:12,background:"linear-gradient(135deg,#16a34a,#4ade80)",
                      color:"white",fontSize:13,fontFamily:"'DM Mono'",fontWeight:500,letterSpacing:1,
                      boxShadow:"0 4px 14px rgba(22,163,74,0.3)"}}>
                    ✅ YES, FINISH
                  </button>
                  <button className="btn" onClick={()=>setFinishConfirm(false)}
                    style={{flex:1,padding:"11px",borderRadius:12,border:"1px solid rgba(255,255,255,0.2)",background:"transparent",
                      color:"rgba(255,255,255,0.6)",fontSize:12,fontFamily:"'DM Mono'",letterSpacing:1}}>
                    CANCEL
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ════════ PROGRESS ════════ */}
        {tab==="Progress"&&(
          <div className="slide">
            {/* Data Recovery Panel */}
            <div style={{background:"white",borderRadius:16,border:"1.5px solid #f0ece4",padding:14,marginBottom:16}}>
              <p style={{fontFamily:"'Syne'",fontSize:14,fontWeight:700,color:"#1a1a2e",marginBottom:4}}>🔍 Data Recovery</p>
              <p style={{fontSize:11,fontFamily:"'DM Mono'",color:"#a0a0b0",marginBottom:12,lineHeight:1.5}}>
                If your data is missing, tap Scan to see what is saved, then tap Recover to restore it.
              </p>
              <div style={{display:"flex",gap:8,marginBottom:scanResult?12:0}}>
                <button className="btn" onClick={scanStorage}
                  style={{flex:1,padding:"9px",borderRadius:10,background:"#EBF2FF",color:"#3B7DD8",fontSize:12,fontFamily:"'DM Mono'",fontWeight:500}}>
                  SCAN STORAGE
                </button>
                <button className="btn" onClick={forceRecover}
                  style={{flex:1,padding:"9px",borderRadius:10,background:recovering?"#16a34a":"#1a1a2e",color:"white",fontSize:12,fontFamily:"'DM Mono'",fontWeight:500}}>
                  {recovering?"✓ RECOVERED!":"FORCE RECOVER"}
                </button>
              </div>
              {scanResult&&(
                <div style={{background:"#fafaf5",borderRadius:10,padding:"10px 12px",border:"1px solid #f0ece4"}}>
                  <p style={{fontSize:10,letterSpacing:2,color:"#b0a898",fontFamily:"'DM Mono'",textTransform:"uppercase",marginBottom:6}}>
                    {scanResult.length} fp: keys found
                  </p>
                  {scanResult.length===0?(
                    <p style={{fontSize:12,fontFamily:"'DM Mono'",color:"#ef4444"}}>No data found — may have been saved in a different browser or device.</p>
                  ):(
                    <div style={{maxHeight:140,overflowY:"auto"}}>
                      {scanResult.map(k=>(
                        <div key={k} style={{fontSize:11,fontFamily:"'DM Mono'",color:"#606070",padding:"2px 0",borderBottom:"1px solid #f5f0e8"}}>{k}</div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Manual Day Entry */}
            <div style={{marginBottom:16}}>
              {!showManualEntry ? (
                <button className="btn" onClick={()=>setShowManualEntry(true)}
                  style={{width:"100%",padding:"13px",borderRadius:14,background:"white",
                    border:"1.5px dashed #d8d0c8",color:"#a0a0b0",fontSize:12,
                    fontFamily:"'DM Mono'",letterSpacing:1}}>
                  + ADD A PAST DAY
                </button>
              ) : (
                <div style={{background:"white",borderRadius:18,border:"1.5px solid #e8e0d4",overflow:"hidden"}}>
                  {/* Panel header */}
                  <div style={{background:"#1a1a2e",padding:"14px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div>
                      <p style={{fontFamily:"'Syne'",fontSize:15,fontWeight:700,color:"white",marginBottom:2}}>Add Past Day</p>
                      <p style={{fontSize:11,fontFamily:"'DM Mono'",color:"rgba(255,255,255,0.45)"}}>Fill in what you remember — save what you have</p>
                    </div>
                    <button className="btn" onClick={()=>setShowManualEntry(false)}
                      style={{color:"rgba(255,255,255,0.4)",background:"none",border:"none",fontSize:20,lineHeight:1}}>✕</button>
                  </div>

                  <div style={{padding:"16px"}}>
                    {/* Date picker */}
                    <div style={{marginBottom:16}}>
                      <p style={{fontSize:10,letterSpacing:2,color:"#b0a898",fontFamily:"'DM Mono'",textTransform:"uppercase",marginBottom:7}}>DATE</p>
                      <input type="date" value={manualDate} onChange={e=>setManualDate(e.target.value)}
                        max={new Date(Date.now()-86400000).toISOString().slice(0,10)}
                        style={{width:"100%",outline:"none",border:"1.5px solid #e8e0d4",borderRadius:12,padding:"11px 13px",
                          fontSize:15,fontFamily:"'DM Mono'",background:"#fafaf5",color:"#1a1a2e"}}/>
                    </div>

                    {/* Calories */}
                    <p style={{fontSize:10,letterSpacing:2,color:"#b0a898",fontFamily:"'DM Mono'",textTransform:"uppercase",marginBottom:8}}>CALORIES</p>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:16}}>
                      {MEALS.map(m=>(
                        <div key={m.id} style={{background:m.bg,borderRadius:12,padding:"10px 12px",border:`1px solid ${m.color}20`}}>
                          <p style={{fontSize:10,fontFamily:"'DM Mono'",color:m.color,marginBottom:5,letterSpacing:1}}>{m.label.toUpperCase()}</p>
                          <input type="number" placeholder={`~${m.target}`}
                            value={manualData[m.id]} onChange={e=>setManualData(p=>({...p,[m.id]:e.target.value}))}
                            style={{width:"100%",outline:"none",border:"none",background:"transparent",fontSize:16,fontFamily:"'DM Mono'",color:"#1a1a2e",fontWeight:500}}/>
                          <p style={{fontSize:9,color:"#b0a898",fontFamily:"'DM Mono'",marginTop:2}}>cal</p>
                        </div>
                      ))}
                      <div style={{background:"#f8fafc",borderRadius:12,padding:"10px 12px",border:"1px solid #e8e0d4"}}>
                        <p style={{fontSize:10,fontFamily:"'DM Mono'",color:"#94A3B8",marginBottom:5,letterSpacing:1}}>OTHER</p>
                        <input type="number" placeholder="0"
                          value={manualData.extra} onChange={e=>setManualData(p=>({...p,extra:e.target.value}))}
                          style={{width:"100%",outline:"none",border:"none",background:"transparent",fontSize:16,fontFamily:"'DM Mono'",color:"#1a1a2e",fontWeight:500}}/>
                        <p style={{fontSize:9,color:"#b0a898",fontFamily:"'DM Mono'",marginTop:2}}>cal</p>
                      </div>
                    </div>

                    {/* Macros */}
                    <p style={{fontSize:10,letterSpacing:2,color:"#b0a898",fontFamily:"'DM Mono'",textTransform:"uppercase",marginBottom:8}}>MACROS</p>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:16}}>
                      {[
                        {key:"protein",label:"Protein",color:"#E8643A",bg:"#FFF0EB"},
                        {key:"carbs",  label:"Carbs",  color:"#3B7DD8",bg:"#EBF2FF"},
                        {key:"fat",    label:"Fat",    color:"#7C3AED",bg:"#F3EEFF"},
                      ].map(m=>(
                        <div key={m.key} style={{background:m.bg,borderRadius:12,padding:"10px 10px",border:`1px solid ${m.color}20`,textAlign:"center"}}>
                          <p style={{fontSize:9,fontFamily:"'DM Mono'",color:m.color,marginBottom:5,letterSpacing:1}}>{m.label.toUpperCase()}</p>
                          <input type="number" placeholder="0"
                            value={manualData[m.key]} onChange={e=>setManualData(p=>({...p,[m.key]:e.target.value}))}
                            style={{width:"100%",outline:"none",border:"none",background:"transparent",fontSize:16,fontFamily:"'DM Mono'",color:"#1a1a2e",fontWeight:600,textAlign:"center"}}/>
                          <p style={{fontSize:9,color:"#b0a898",fontFamily:"'DM Mono'",marginTop:2}}>g</p>
                        </div>
                      ))}
                    </div>

                    {/* Steps & Water */}
                    <p style={{fontSize:10,letterSpacing:2,color:"#b0a898",fontFamily:"'DM Mono'",textTransform:"uppercase",marginBottom:8}}>STEPS & WATER</p>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:16}}>
                      <div style={{background:"#F0FDF4",borderRadius:12,padding:"10px 12px",border:"1px solid #bbf7d030"}}>
                        <p style={{fontSize:9,fontFamily:"'DM Mono'",color:"#16A34A",marginBottom:5,letterSpacing:1}}>STEPS 👟</p>
                        <input type="number" placeholder="0"
                          value={manualData.steps} onChange={e=>setManualData(p=>({...p,steps:e.target.value}))}
                          style={{width:"100%",outline:"none",border:"none",background:"transparent",fontSize:16,fontFamily:"'DM Mono'",color:"#1a1a2e",fontWeight:500}}/>
                      </div>
                      <div style={{background:"#EBF2FF",borderRadius:12,padding:"10px 12px",border:"1px solid #93c5fd30"}}>
                        <p style={{fontSize:9,fontFamily:"'DM Mono'",color:"#3B7DD8",marginBottom:5,letterSpacing:1}}>WATER 💧 (ml)</p>
                        <input type="number" placeholder="0"
                          value={manualData.water} onChange={e=>setManualData(p=>({...p,water:e.target.value}))}
                          style={{width:"100%",outline:"none",border:"none",background:"transparent",fontSize:16,fontFamily:"'DM Mono'",color:"#1a1a2e",fontWeight:500}}/>
                      </div>
                    </div>

                    {/* Habits */}
                    <p style={{fontSize:10,letterSpacing:2,color:"#b0a898",fontFamily:"'DM Mono'",textTransform:"uppercase",marginBottom:8}}>HABITS COMPLETED</p>
                    <div style={{display:"flex",flexDirection:"column",gap:7,marginBottom:20}}>
                      {HABITS.map(h=>(
                        <button key={h.id} className="btn" onClick={()=>setManualData(p=>({...p,habits:{...p.habits,[h.id]:!p.habits[h.id]}}))}
                          style={{display:"flex",alignItems:"center",gap:12,padding:"10px 12px",borderRadius:10,textAlign:"left",
                            background:manualData.habits[h.id]?h.color:"#fafaf5",
                            border:`1.5px solid ${manualData.habits[h.id]?h.color:"#e8e0d4"}`}}>
                          <div style={{width:20,height:20,borderRadius:6,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",
                            background:manualData.habits[h.id]?"rgba(255,255,255,0.3)":"white",
                            border:`2px solid ${manualData.habits[h.id]?"rgba(255,255,255,0.5)":"#d8d0c8"}`}}>
                            {manualData.habits[h.id]&&<span style={{color:manualData.habits[h.id]?"white":"transparent",fontSize:11}}>✓</span>}
                          </div>
                          <span style={{fontSize:14}}>{h.icon}</span>
                          <span style={{fontSize:13,fontFamily:"'DM Mono'",color:manualData.habits[h.id]?"white":"#606070"}}>{h.label}</span>
                        </button>
                      ))}
                    </div>

                    {/* Save button */}
                    <button className="btn" onClick={saveManualDay}
                      style={{width:"100%",padding:"14px",borderRadius:14,fontSize:14,fontFamily:"'DM Mono'",fontWeight:500,letterSpacing:1,
                        background:manualSaved?"linear-gradient(135deg,#16a34a,#4ade80)":"linear-gradient(135deg,#1a1a2e,#2d1b4e)",
                        color:"white",boxShadow:manualSaved?"0 6px 20px rgba(22,163,74,0.3)":"0 6px 20px rgba(26,26,46,0.25)"}}>
                      {manualSaved ? "✓ SAVED PERMANENTLY!" : "SAVE DAY"}
                    </button>
                  </div>
                </div>
              )}
            </div>


            {/* Big number cards */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:16}}>
              {[{l:"Start",v:START_WEIGHT,c:"#94A3B8",bg:"#F8FAFC"},{l:"Now",v:latestW||"—",c:"#3B7DD8",bg:"#EBF2FF"},{l:"Goal",v:GOAL_WEIGHT,c:"#16A34A",bg:"#F0FDF4"}].map(x=>(
                <div key={x.l} style={{background:x.bg,borderRadius:16,padding:"16px 12px",textAlign:"center",border:`2px solid ${x.c}20`}}>
                  <div style={{fontSize:9,letterSpacing:3,textTransform:"uppercase",color:x.c,marginBottom:6,fontFamily:"'DM Mono'"}}>{x.l}</div>
                  <div style={{fontFamily:"'Syne'",fontSize:26,fontWeight:800,color:x.c}}>{x.v}</div>
                  <div style={{fontSize:10,color:"#a0a0b0",fontFamily:"'DM Mono'"}}>lbs</div>
                </div>
              ))}
            </div>

            {/* Progress bar */}
            <BigCard label="JOURNEY PROGRESS" right={lost>0?<span style={{fontFamily:"'Syne'",fontSize:18,fontWeight:700,color:"#16a34a"}}>−{lost.toFixed(1)} lbs</span>:null}>
              <div style={{background:"rgba(22,163,74,0.1)",borderRadius:12,height:16,marginBottom:8,overflow:"hidden",border:"1.5px solid rgba(22,163,74,0.15)"}}>
                <div style={{width:`${progPct}%`,height:"100%",background:"linear-gradient(90deg,#3B7DD8,#16a34a)",borderRadius:12,transition:"width 0.8s ease",position:"relative"}}>
                  {progPct>5&&<div style={{position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",fontSize:10,color:"white",fontFamily:"'DM Mono'",fontWeight:500}}>{progPct.toFixed(0)}%</div>}
                </div>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"#a0a0b0",fontFamily:"'DM Mono'",marginBottom:12}}>
                <span>{START_WEIGHT} lbs start</span>
                <span>{GOAL_WEIGHT} lbs goal</span>
              </div>
              {parseFloat(toGo)>0&&(
                <div style={{padding:"10px 14px",borderRadius:12,background:"#F0FDF4",border:"1.5px solid #bbf7d0",fontSize:12,fontFamily:"'DM Mono'",color:"#16a34a",fontWeight:500}}>
                  🎯 {toGo} lbs to go — ~{Math.ceil(toGo/2)} weeks at 2 lbs/week
                </div>
              )}
            </BigCard>

            {/* Chart */}
            <BigCard label="WEIGHT CHART" sub="tap a point to see details">
              {chartData.length<2?(
                <div style={{textAlign:"center",padding:"32px 0",color:"#b0b0c0"}}>
                  <div style={{fontSize:40,marginBottom:10}}>📊</div>
                  <p style={{fontSize:13,fontFamily:"'DM Mono'"}}>Log 2+ weigh-ins to see your chart</p>
                </div>
              ):(
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={chartData} margin={{top:10,right:10,left:-24,bottom:0}}>
                    <XAxis dataKey="date" tick={{fontSize:10,fill:"#a0a0b0",fontFamily:"'DM Mono'"}} tickLine={false} axisLine={false}/>
                    <YAxis domain={["auto","auto"]} tick={{fontSize:10,fill:"#a0a0b0",fontFamily:"'DM Mono'"}} tickLine={false} axisLine={false}/>
                    <Tooltip content={<ChartTip/>}/>
                    <ReferenceLine y={GOAL_WEIGHT} stroke="#16a34a" strokeDasharray="5 5" label={{value:`Goal ${GOAL_WEIGHT}`,position:"insideTopRight",fontSize:10,fill:"#16a34a",fontFamily:"'DM Mono'"}}/>
                    <Line type="monotone" dataKey="weight" stroke="#3B7DD8" strokeWidth={3} dot={{r:5,fill:"#3B7DD8",stroke:"white",strokeWidth:2}} activeDot={{r:7,fill:"#3B7DD8"}}/>
                  </LineChart>
                </ResponsiveContainer>
              )}
            </BigCard>

            {/* Log Today's Weight */}
            <BigCard label="LOG TODAY'S WEIGHT" sub="First thing in the morning for consistency">
              <div style={{display:"flex",gap:10,marginBottom:12}}>
                <input className="inp" type="number" placeholder="e.g. 143.5" step="0.1"
                  value={wInput} onChange={e=>setWInput(e.target.value)}
                  onKeyDown={e=>e.key==="Enter"&&logW()} style={{flex:1}}/>
                <span style={{fontSize:12,color:"#a0a0b0",alignSelf:"center",flexShrink:0,fontFamily:"'DM Mono'"}}>lbs</span>
                <button className="btn" onClick={logW}
                  style={{padding:"10px 18px",borderRadius:12,flexShrink:0,letterSpacing:1,
                    background:wSaved?"#16a34a":"#1a1a2e",color:"white",fontSize:12,fontWeight:500,fontFamily:"'DM Mono'",
                    boxShadow:wSaved?"0 4px 12px rgba(22,163,74,0.3)":"0 4px 12px rgba(26,26,46,0.2)"}}>
                  {wSaved?"✓ SAVED":"SAVE"}
                </button>
              </div>
              {/* Add past weight toggle */}
              {!showPastWeight ? (
                <button className="btn" onClick={()=>setShowPastWeight(true)}
                  style={{width:"100%",padding:"9px",borderRadius:10,background:"transparent",
                    border:"1px dashed #d8d0c8",color:"#b0a898",fontSize:11,fontFamily:"'DM Mono'",letterSpacing:1}}>
                  + ADD A PAST WEIGHT
                </button>
              ) : (
                <div style={{background:"#fafaf5",borderRadius:14,padding:"14px",border:"1.5px solid #e8e0d4"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                    <p style={{fontFamily:"'Syne'",fontSize:13,fontWeight:700,color:"#1a1a2e"}}>Add Past Weight</p>
                    <button className="btn" onClick={()=>setShowPastWeight(false)}
                      style={{color:"#c0b8b0",background:"none",border:"none",fontSize:18,lineHeight:1}}>✕</button>
                  </div>
                  <div style={{display:"flex",gap:8,marginBottom:10}}>
                    <input type="date" value={pastWeightDate}
                      onChange={e=>setPastWeightDate(e.target.value)}
                      max={new Date(Date.now()-86400000).toISOString().slice(0,10)}
                      style={{flex:1,outline:"none",border:"1.5px solid #e8e0d4",borderRadius:10,padding:"9px 11px",
                        fontSize:14,fontFamily:"'DM Mono'",background:"white",color:"#1a1a2e"}}/>
                    <input type="number" placeholder="lbs" step="0.1" value={pastWeightVal}
                      onChange={e=>setPastWeightVal(e.target.value)}
                      onKeyDown={e=>e.key==="Enter"&&logPastWeight()}
                      style={{width:90,outline:"none",border:"1.5px solid #e8e0d4",borderRadius:10,padding:"9px 11px",
                        fontSize:14,fontFamily:"'DM Mono'",background:"white",color:"#1a1a2e"}}/>
                    <button className="btn" onClick={logPastWeight}
                      style={{padding:"9px 14px",borderRadius:10,fontSize:12,fontWeight:500,fontFamily:"'DM Mono'",letterSpacing:1,flexShrink:0,
                        background:pastWeightSaved?"#16a34a":"#1a1a2e",color:"white"}}>
                      {pastWeightSaved?"✓":"SAVE"}
                    </button>
                  </div>
                  <p style={{fontSize:10,fontFamily:"'DM Mono'",color:"#b0a898",lineHeight:1.5}}>
                    Saved permanently — will appear in your chart and history below.
                  </p>
                </div>
              )}
            </BigCard>

            {/* Weight History */}
            {wLog.length>0&&(
              <BigCard label="WEIGH-IN HISTORY">
                {[...wLog].reverse().map((e,i,arr)=>{
                  const prev = arr[i+1];
                  const diff = prev ? (e.weight-prev.weight).toFixed(1) : null;
                  const isToday = e.date===today;
                  return (
                    <div key={e.date} style={{display:"flex",alignItems:"center",padding:"11px 0",
                      borderBottom:i<arr.length-1?"1px solid #f5f0e8":"none",
                      background:isToday?"#fafaf5":"transparent"}}>
                      <div style={{flex:1}}>
                        <p style={{fontSize:13,fontFamily:"'DM Mono'",color:isToday?"#3B7DD8":"#606070",fontWeight:isToday?500:400,marginBottom:1}}>
                          {e.label}{isToday?" · today":""}
                        </p>
                        {diff!=null&&(
                          <p style={{fontSize:11,fontFamily:"'DM Mono'",fontWeight:500,
                            color:parseFloat(diff)<0?"#16a34a":parseFloat(diff)>0?"#ef4444":"#a0a0b0"}}>
                            {parseFloat(diff)>0?"+":""}{diff} lbs {parseFloat(diff)<0?"↓":parseFloat(diff)>0?"↑":"→"}
                          </p>
                        )}
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <span style={{fontFamily:"'Syne'",fontSize:20,fontWeight:800,color:isToday?"#3B7DD8":"#1a1a2e"}}>{e.weight}</span>
                        <span style={{fontSize:11,color:"#a0a0b0",fontFamily:"'DM Mono'"}}>lbs</span>
                        <button className="btn" onClick={()=>{
                          const next=wLog.filter(x=>x.date!==e.date);
                          setWLog(next);
                          try{localStorage.removeItem(`fp:weight:${e.date}`);}catch(err){}
                          const idx2=load("fp:weightindex",[]).filter(d=>d!==e.date);
                          save("fp:weightindex",idx2);
                        }} style={{fontSize:14,color:"#e0d8d0",background:"none",border:"none",lineHeight:1,padding:"2px 4px"}}>✕</button>
                      </div>
                    </div>
                  );
                })}
              </BigCard>
            )}
            {/* Day History */}
            {dayHistory.length > 0 && (
              <div style={{marginTop:8}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                  <Label text="DAY HISTORY" style={{marginBottom:0}}/>
                  <span style={{fontSize:10,fontFamily:"'DM Mono'",color:"#b0a898"}}>{dayHistory.length} day{dayHistory.length!==1?"s":""} saved</span>
                </div>
                {dayHistory.map((day) => {
                  const protG   = parseInt(day.macros?.protein)||0;
                  const carbsG  = parseInt(day.macros?.carbs)||0;
                  const fatG    = parseInt(day.macros?.fat)||0;
                  const stepsN  = parseInt(day.steps)||0;
                  const habDone = Object.values(day.habits||{}).filter(Boolean).length;
                  const waterL  = day.water>=1000?`${(day.water/1000).toFixed(1)}L`:day.water>0?`${day.water}ml`:"—";
                  const calOk   = day.totalCals>0 && day.totalCals<=1400;
                  const stepsOk = stepsN>=10000;
                  const protOk  = protG>=100;
                  const score   = [calOk,stepsOk,protOk,habDone>=3].filter(Boolean).length;
                  const scoreColor = score===4?"#16a34a":score>=2?"#F0A500":"#E8643A";

                  return (
                    <div key={day.date} style={{background:"white",borderRadius:18,border:"1.5px solid #f0ece4",marginBottom:14,overflow:"hidden",boxShadow:"0 2px 12px rgba(26,26,46,0.05)"}}>

                      {/* Header */}
                      <div style={{background:"#1a1a2e",padding:"14px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <div>
                          <p style={{fontFamily:"'Syne'",fontSize:15,fontWeight:700,color:"white",marginBottom:2}}>{day.label}</p>
                          <p style={{fontSize:10,fontFamily:"'DM Mono'",color:"rgba(255,255,255,0.4)"}}>
                            {day.finishedAt ? `Finished at ${new Date(day.finishedAt).toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"})}` : "Completed"}
                          </p>
                        </div>
                        <div style={{background:scoreColor,borderRadius:12,padding:"8px 12px",textAlign:"center",minWidth:52}}>
                          <div style={{fontFamily:"'Syne'",fontSize:20,fontWeight:800,color:"white"}}>{score}/4</div>
                          <div style={{fontSize:9,color:"rgba(255,255,255,0.75)",fontFamily:"'DM Mono'",letterSpacing:1}}>SCORE</div>
                        </div>
                      </div>

                      {/* Calories bar */}
                      {day.totalCals>0&&(
                        <div style={{padding:"12px 16px",borderBottom:"1px solid #f5f0e8"}}>
                          <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                            <span style={{fontSize:11,fontFamily:"'DM Mono'",color:"#a0a0b0",letterSpacing:1}}>CALORIES</span>
                            <span style={{fontFamily:"'Syne'",fontSize:14,fontWeight:700,color:calOk?"#16a34a":"#E8643A"}}>{day.totalCals} cal</span>
                          </div>
                          <div style={{background:"#f5f0e8",borderRadius:6,height:6,overflow:"hidden"}}>
                            <div style={{width:`${Math.min((day.totalCals/1400)*100,100)}%`,height:"100%",background:calOk?"#16a34a":"#E8643A",borderRadius:6}}/>
                          </div>
                          {/* Meal breakdown */}
                          <div style={{display:"flex",gap:8,marginTop:8,flexWrap:"wrap"}}>
                            {MEALS.map(m => parseInt(day.cals?.[m.id])>0&&(
                              <span key={m.id} style={{fontSize:10,fontFamily:"'DM Mono'",color:m.color,background:`${m.color}15`,borderRadius:8,padding:"2px 8px"}}>
                                {m.label}: {day.cals[m.id]} cal
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Stats grid */}
                      <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",borderBottom:"1px solid #f5f0e8"}}>
                        {[
                          {label:"STEPS",   val:stepsN>0?stepsN.toLocaleString():"—",   ok:stepsOk,  color:"#3B7DD8",  icon:"👟"},
                          {label:"WATER",   val:waterL,                                  ok:day.water>=2000, color:"#0891B2", icon:"💧"},
                        ].map((s,i)=>(
                          <div key={s.label} style={{padding:"12px 14px",borderRight:i===0?"1px solid #f5f0e8":"none"}}>
                            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                              <span style={{fontSize:14}}>{s.icon}</span>
                              <span style={{fontSize:9,letterSpacing:2,color:"#b0a898",fontFamily:"'DM Mono'",textTransform:"uppercase"}}>{s.label}</span>
                              {s.ok&&<span style={{fontSize:9,color:s.color,marginLeft:"auto"}}>✓</span>}
                            </div>
                            <div style={{fontFamily:"'Syne'",fontSize:18,fontWeight:700,color:s.ok?s.color:"#1a1a2e"}}>{s.val}</div>
                          </div>
                        ))}
                      </div>

                      {/* Macros row */}
                      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",borderBottom:"1px solid #f5f0e8"}}>
                        {[
                          {label:"PROTEIN", val:protG>0?`${protG}g`:"—", ok:protOk,  color:"#E8643A"},
                          {label:"CARBS",   val:carbsG>0?`${carbsG}g`:"—", ok:carbsG>0, color:"#3B7DD8"},
                          {label:"FAT",     val:fatG>0?`${fatG}g`:"—",   ok:fatG>0,  color:"#7C3AED"},
                        ].map((m,i)=>(
                          <div key={m.label} style={{padding:"10px 10px",borderRight:i<2?"1px solid #f5f0e8":"none",textAlign:"center"}}>
                            <div style={{fontSize:9,letterSpacing:1.5,color:"#b0a898",fontFamily:"'DM Mono'",textTransform:"uppercase",marginBottom:4}}>{m.label}</div>
                            <div style={{fontFamily:"'Syne'",fontSize:16,fontWeight:700,color:m.ok?m.color:"#c0b8b0"}}>{m.val}</div>
                          </div>
                        ))}
                      </div>

                      {/* Habits row */}
                      <div style={{padding:"10px 14px",display:"flex",alignItems:"center",gap:8}}>
                        <span style={{fontSize:10,letterSpacing:2,color:"#b0a898",fontFamily:"'DM Mono'"}}>HABITS</span>
                        <div style={{display:"flex",gap:5,flex:1}}>
                          {HABITS.map(h=>(
                            <span key={h.id} style={{fontSize:16,opacity:day.habits?.[h.id]?1:0.18,filter:day.habits?.[h.id]?"none":"grayscale(1)"}}>{h.icon}</span>
                          ))}
                        </div>
                        <span style={{fontSize:11,fontFamily:"'DM Mono'",color:habDone>=4?"#16a34a":"#b0a898",fontWeight:habDone>=4?600:400}}>{habDone}/5</span>
                      </div>

                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ════════ SCHEDULE ════════ */}
        {tab==="Schedule"&&(
          <div className="slide">
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <Label text="THIS WEEK" style={{marginBottom:0}}/>
              <button className="btn" onClick={()=>setWeekPlan(DEFAULT_PLAN)}
                style={{fontSize:10,color:"#b0a898",background:"none",border:"1px dashed #d8d0c8",borderRadius:8,padding:"4px 10px",fontFamily:"'DM Mono'",letterSpacing:1}}>
                RESET DEFAULT
              </button>
            </div>
            <Pill color="#3B7DD8" bg="#EBF2FF" text="Tap any day to reassign its workout — drag your plan around to fit your week."/>

            <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:16}}>
              {Object.entries(weekPlan).map(([dayName, workoutKey])=>{
                const isRest = workoutKey==="rest";
                const wo = !isRest ? WORKOUTS[workoutKey] : null;
                const color = wo ? wo.color : "#94A3B8";
                const icon = {sunday:"🏃‍♀️",monday:"💪",tuesday:"⚡",wednesday:"🦵",friday:"🚴‍♀️",rest:"😴"}[workoutKey]||"😴";
                const isEditing = editingDay===dayName;
                return (
                  <div key={dayName}>
                    <div style={{display:"flex",alignItems:"center",gap:12,padding:"13px 15px",borderRadius:16,cursor:"pointer",
                      background:isRest?"white":color,
                      border:isRest?"2px solid #e8e0d4":"none",
                      boxShadow:!isRest?`0 5px 18px ${color}40`:"none",
                      outline:isEditing?`3px solid ${isRest?"#3B7DD8":color}`:"none",
                      outlineOffset:2}}
                      onClick={()=>setEditingDay(isEditing?null:dayName)}>
                      <div style={{width:42,height:42,borderRadius:11,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0,
                        background:isRest?"#f5f0e8":"rgba(255,255,255,0.2)"}}>
                        {icon}
                      </div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontFamily:"'Syne'",fontWeight:700,fontSize:15,color:isRest?"#1a1a2e":"white",marginBottom:2}}>{dayName}</div>
                        <div style={{fontSize:12,fontFamily:"'DM Mono'",color:isRest?"#909090":"rgba(255,255,255,0.75)"}}>
                          {isRest?"Rest Day":wo?.title||""}
                        </div>
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
                        {workoutKey!=="rest" && <span style={{fontSize:10,background:isRest?"#f0ece4":"rgba(255,255,255,0.2)",color:isRest?"#a0a0b0":"rgba(255,255,255,0.8)",borderRadius:8,padding:"3px 8px",fontFamily:"'DM Mono'",letterSpacing:1}}>
                          {workoutKey==="tuesday"?"OPTIONAL":""}
                        </span>}
                        <span style={{fontSize:16,color:isRest?"#c0b8b0":"rgba(255,255,255,0.6)"}}>{isEditing?"▲":"✎"}</span>
                      </div>
                    </div>
                    {/* Dropdown workout picker */}
                    {isEditing&&(
                      <div style={{background:"white",borderRadius:14,border:"1.5px solid #e8e0d4",overflow:"hidden",marginTop:4,boxShadow:"0 8px 24px rgba(26,26,46,0.12)"}}>
                        <div style={{padding:"10px 14px 6px",borderBottom:"1px solid #f0ece4"}}>
                          <p style={{fontSize:10,letterSpacing:2,color:"#b0a898",fontFamily:"'DM Mono'",textTransform:"uppercase"}}>Assign to {dayName}</p>
                        </div>
                        {ALL_WORKOUT_OPTIONS.map(opt=>(
                          <button key={opt.key} className="btn" onClick={()=>assignWorkout(dayName, opt.key)}
                            style={{display:"flex",alignItems:"center",gap:12,width:"100%",padding:"11px 14px",textAlign:"left",
                              background:workoutKey===opt.key?`${opt.color}18`:"white",
                              borderBottom:"1px solid #f5f0e8",borderTop:"none",borderLeft:"none",borderRight:"none",
                              borderLeft:workoutKey===opt.key?`3px solid ${opt.color}`:"3px solid transparent"}}>
                            <span style={{fontSize:18}}>{opt.icon}</span>
                            <span style={{fontFamily:"'DM Mono'",fontSize:13,color:workoutKey===opt.key?opt.color:"#404040",fontWeight:workoutKey===opt.key?500:400}}>{opt.label}</span>
                            {workoutKey===opt.key&&<span style={{marginLeft:"auto",fontSize:12,color:opt.color}}>✓</span>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <BigCard label="EVENING TIMING" sub="On days when you train after work">
              {[{t:"1:00pm",d:"Big carb-heavy lunch — fuel for later",c:"#3B7DD8"},{t:"5:30pm",d:"Light pre-workout snack: banana + nut butter",c:"#E8643A"},{t:"8:00–8:30pm",d:"Post-workout dinner — protein-focused",c:"#7C3AED"},{t:"9:00–9:30pm",d:"Light snack within your IF window",c:"#16A34A"}].map((r,i)=>(
                <div key={r.t} style={{display:"flex",gap:14,padding:"10px 0",borderBottom:i<3?"1px solid #f0ece4":"none"}}>
                  <span style={{fontSize:12,fontWeight:500,color:r.c,minWidth:82,fontFamily:"'DM Mono'"}}>{r.t}</span>
                  <span style={{fontSize:12,color:"#606070",lineHeight:1.5,fontFamily:"'DM Mono'"}}>{r.d}</span>
                </div>
              ))}
            </BigCard>
          </div>
        )}

        {/* ════════ WORKOUTS ════════ */}
        {tab==="Workouts"&&(
          <div className="slide">
            {/* Day selector — driven by weekPlan */}
            <div style={{display:"flex",gap:8,marginBottom:16,overflowX:"auto",paddingBottom:4}}>
              {Object.entries(weekPlan).filter(([,wk])=>wk!=="rest").map(([dayName, wk])=>{
                const wo=WORKOUTS[wk];
                return <button key={dayName} className="btn" onClick={()=>setWDay(wk+"::"+dayName)}
                  style={{padding:"9px 16px",borderRadius:20,fontSize:12,fontWeight:500,whiteSpace:"nowrap",border:"none",fontFamily:"'DM Mono'",letterSpacing:1,
                    background:wDay===wk+"::"+dayName?wo.color:"white",color:wDay===wk+"::"+dayName?"white":"#606070",
                    boxShadow:wDay===wk+"::"+dayName?`0 4px 14px ${wo.color}50`:"0 0 0 1.5px #e8e0d4"}}>
                  {dayName.slice(0,3).toUpperCase()}
                </button>;
              })}
            </div>

            {(()=>{
              // wDay is now "workoutKey::dayName" e.g. "monday::Wednesday"
              const [wKey] = wDay.includes("::")? wDay.split("::") : [wDay, wDay];
              const w=WORKOUTS[wKey]||WORKOUTS["monday"];
              const all=w.sections.flatMap(s=>s.ex.map(e=>e.id));
              const done=all.filter(id=>checked[id]).length;
              const pct=all.length>0?Math.round((done/all.length)*100):0;
              return (
                <div>
                  {/* Workout hero */}
                  <div style={{background:w.color,borderRadius:20,padding:"20px 18px",marginBottom:14,position:"relative",overflow:"hidden",boxShadow:`0 10px 32px ${w.color}50`}}>
                    <div style={{position:"absolute",top:-30,right:-30,width:140,height:140,borderRadius:"50%",background:"rgba(255,255,255,0.1)"}}/>
                    <div style={{position:"absolute",bottom:-20,left:-20,width:100,height:100,borderRadius:"50%",background:"rgba(255,255,255,0.08)"}}/>
                    <div style={{position:"relative",zIndex:1,display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                      <div>
                        <h2 style={{fontFamily:"'Syne'",fontSize:22,fontWeight:800,color:"white",marginBottom:4,letterSpacing:"-0.02em"}}>{w.title}</h2>
                        <p style={{fontSize:12,color:"rgba(255,255,255,0.7)",fontFamily:"'DM Mono'"}}>{w.sub}</p>
                      </div>
                      <div style={{background:"rgba(255,255,255,0.2)",borderRadius:14,padding:"8px 12px",textAlign:"center",backdropFilter:"blur(4px)"}}>
                        <div style={{fontFamily:"'Syne'",fontSize:22,fontWeight:800,color:"white"}}>{pct}%</div>
                        <div style={{fontSize:9,color:"rgba(255,255,255,0.7)",fontFamily:"'DM Mono'",letterSpacing:1}}>DONE</div>
                      </div>
                    </div>
                    <div style={{background:"rgba(255,255,255,0.2)",borderRadius:6,height:6,marginTop:14,overflow:"hidden"}}>
                      <div style={{width:`${pct}%`,height:"100%",background:"white",borderRadius:6,transition:"width 0.4s"}}/>
                    </div>
                  </div>

                  {wDay==="tuesday"&&<Pill color="#F0A500" bg="#FFF9E6" text="⚡ Optional session — only do it if you feel up to it!"/>}

                  {w.sections.map(sec=>(
                    <div key={sec.name} style={{marginBottom:14}}>
                      <p style={{fontSize:10,letterSpacing:2,color:"#b0b0c0",marginBottom:8,fontFamily:"'DM Mono'",textTransform:"uppercase"}}>{sec.name}</p>
                      <div style={{background:"white",borderRadius:16,overflow:"hidden",border:"1.5px solid #f0ece4"}}>
                        {sec.ex.map((ex,i)=>(
                          <div key={ex.id} className="row" onClick={()=>setChecked(p=>({...p,[ex.id]:!p[ex.id]}))}
                            style={{display:"flex",alignItems:"center",gap:12,padding:"13px 14px",
                              borderBottom:i<sec.ex.length-1?"1px solid #f5f0e8":"none",
                              background:checked[ex.id]?w.accent:i%2===0?"white":"#fdf9f5"}}>
                            <div style={{width:22,height:22,borderRadius:7,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",
                              background:checked[ex.id]?w.color:"white",
                              border:`2px solid ${checked[ex.id]?w.color:"#e0d8d0"}`,
                              boxShadow:checked[ex.id]?`0 3px 10px ${w.color}50`:"none"}}>
                              {checked[ex.id]&&<span style={{color:"white",fontSize:12,lineHeight:1}}>✓</span>}
                            </div>
                            <span style={{fontSize:13,flex:1,fontFamily:"'DM Mono'",color:checked[ex.id]?"#b0b0c0":"#1a1a2e",textDecoration:checked[ex.id]?"line-through":"none"}}>{ex.n}</span>
                            <span style={{fontSize:11,color:"#c0b8b0",fontFamily:"'DM Mono'"}}>{ex.d}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}

                  {done===all.length&&all.length>0&&(
                    <div style={{background:"linear-gradient(135deg,#16a34a,#4ade80)",borderRadius:16,padding:"16px",textAlign:"center",marginBottom:12,boxShadow:"0 8px 24px rgba(22,163,74,0.3)"}}>
                      <div style={{fontSize:28,marginBottom:6}}>🎉</div>
                      <p style={{fontFamily:"'Syne'",fontSize:16,fontWeight:700,color:"white"}}>WORKOUT COMPLETE!</p>
                    </div>
                  )}
                  <button className="btn" onClick={()=>all.forEach(id=>setChecked(p=>({...p,[id]:false})))}
                    style={{width:"100%",padding:"11px",borderRadius:14,border:"1.5px dashed #d0c8bc",background:"transparent",color:"#b0b0c0",fontSize:11,fontFamily:"'DM Mono'",letterSpacing:2}}>
                    CLEAR CHECKBOXES
                  </button>
                </div>
              );
            })()}
          </div>
        )}

        {/* ════════ NUTRITION ════════ */}
        {tab==="Nutrition"&&(
          <div className="slide">
            <Label text="DAILY MEALS"/>
            {MEALS.map(m=>(
              <div key={m.id} style={{background:m.color,borderRadius:20,marginBottom:12,overflow:"hidden",boxShadow:`0 8px 24px ${m.color}40`}}>
                <div style={{padding:"16px 18px"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                    <span style={{fontFamily:"'Syne'",fontSize:20,fontWeight:800,color:"white"}}>{m.label}</span>
                    <span style={{fontFamily:"'DM Mono'",fontSize:12,color:"rgba(255,255,255,0.7)",background:"rgba(255,255,255,0.2)",borderRadius:20,padding:"3px 10px"}}>~{m.target} cal</span>
                  </div>
                  <span style={{fontSize:11,color:"rgba(255,255,255,0.6)",fontFamily:"'DM Mono'"}}>{m.time}</span>
                </div>
                <div style={{background:m.bg,padding:"14px 18px"}}>
                  {m.ideas.map(idea=>(
                    <div key={idea} style={{display:"flex",gap:8,paddingBottom:5}}>
                      <div style={{width:6,height:6,borderRadius:2,background:m.color,marginTop:5,flexShrink:0}}/>
                      <span style={{fontSize:13,color:"#404040",lineHeight:1.5,fontFamily:"'DM Mono'"}}>{idea}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <Pill color="#3B7DD8" bg="#EBF2FF" text="IF Window: Fast 9/10pm – 1pm. Black coffee, tea, and water are fine during your fast."/>

            <Label text="SMART SWAPS" style={{marginTop:8}}/>
            <div style={{background:"white",borderRadius:16,border:"1.5px solid #f0ece4",overflow:"hidden"}}>
              {[["Creamy sauce","Tomato sauce","~150 cal"],["Full rice portion","Half + extra veg","~100 cal"],["Crisps","Rice cakes + hummus","~120 cal"],["Sugary yogurt","0% Greek + berries","~80 cal"],["Fruit juice","Whole fruit + water","~80 cal"]].map(([f,t,s],i)=>(
                <div key={f} style={{display:"flex",alignItems:"center",padding:"12px 14px",borderBottom:i<4?"1px solid #f5f0e8":"none",gap:8}}>
                  <span style={{fontSize:12,color:"#c0b8b0",flex:1,textDecoration:"line-through",fontFamily:"'DM Mono'"}}>{f}</span>
                  <span style={{fontSize:14,color:"#e0d8d0"}}>→</span>
                  <span style={{fontSize:12,flex:1,fontFamily:"'DM Mono'",color:"#404040"}}>{t}</span>
                  <span style={{fontSize:12,fontWeight:500,color:"#16a34a",minWidth:52,textAlign:"right",fontFamily:"'DM Mono'"}}>{s}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ════════ DRINKS ════════ */}
        {tab==="Drinks"&&(
          <div className="slide">
            <Label text="WEEKEND DRINKS GUIDE"/>
            <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:16}}>
              {DRINKS.map(d=>(
                <div key={d.name} style={{background:"white",borderRadius:16,padding:"14px 16px",border:"1.5px solid #f0ece4"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                    <span style={{fontSize:13,fontFamily:"'DM Mono'",color:"#1a1a2e"}}>{d.name}</span>
                    <span style={{fontFamily:"'Syne'",fontSize:16,fontWeight:700,color:d.r>=4?"#16a34a":d.r>=3?"#f59e0b":"#ef4444"}}>{d.cal}</span>
                  </div>
                  <div style={{display:"flex",gap:4}}>
                    {[1,2,3,4,5].map(s=><div key={s} style={{flex:1,height:5,borderRadius:3,background:s<=d.r?(d.r>=4?"#16a34a":d.r>=3?"#f59e0b":"#ef4444"):"#f0ece4"}}/>)}
                  </div>
                </div>
              ))}
            </div>
            <Pill color="#E8643A" bg="#FFF0EB" text="Reality Check: 3–4 drinks on Saturday won't ruin progress. Nail weekdays and enjoy weekends — just skip starchy carbs at dinner that night."/>

            <Label text="DAILY NON-NEGOTIABLES" style={{marginTop:8}}/>
            {[{i:"💧",t:"2–2.5L water daily"},{i:"👟",t:"10,000 steps — every day"},{i:"🥩",t:"Protein at every meal"},{i:"🕐",t:"Eating window 1pm–9/10pm"},{i:"😴",t:"7–8 hours sleep"}].map((h,i)=>(
              <div key={h.t} style={{display:"flex",gap:14,background:"white",borderRadius:14,padding:"13px 14px",border:"1.5px solid #f0ece4",marginBottom:8}}>
                <span style={{fontSize:20}}>{h.i}</span>
                <span style={{fontSize:13,color:"#404040",lineHeight:1.5,fontFamily:"'DM Mono'"}}>{h.t}</span>
              </div>
            ))}
            <div style={{background:"linear-gradient(135deg,#1a1a2e,#2d3a5e)",borderRadius:18,padding:18,marginTop:8,boxShadow:"0 10px 32px rgba(26,26,46,0.2)"}}>
              <p style={{fontFamily:"'Syne'",fontSize:17,fontWeight:700,color:"white",marginBottom:6}}>4-Week Milestone 🎯</p>
              <p style={{fontSize:13,color:"rgba(255,255,255,0.7)",lineHeight:1.7,fontFamily:"'DM Mono'"}}>After 4 weeks: ~6–8 lbs lost, stronger workouts, more energy, visible changes. Stay consistent. Trust the process. You've got this.</p>
            </div>
          </div>
        )}

        {/* ════════ SHOP ════════ */}
        {tab==="Shop"&&(
          <div className="slide">

            {/* Stats row */}
            {shopItems.length>0&&(
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:16}}>
                {[
                  {label:"TO GET", val:shopItems.filter(i=>!i.done).length, color:"#E8643A", bg:"#FFF0EB"},
                  {label:"GOT IT", val:shopItems.filter(i=>i.done).length,  color:"#16a34a", bg:"#F0FDF4"},
                  {label:"TOTAL",  val:shopItems.length,                    color:"#3B7DD8", bg:"#EBF2FF"},
                ].map(s=>(
                  <div key={s.label} style={{background:s.bg,borderRadius:14,padding:"12px 8px",textAlign:"center",border:`1.5px solid ${s.color}20`}}>
                    <div style={{fontFamily:"'Syne'",fontSize:26,fontWeight:800,color:s.color}}>{s.val}</div>
                    <div style={{fontSize:9,letterSpacing:2,color:s.color,fontFamily:"'DM Mono'",textTransform:"uppercase",marginTop:1}}>{s.label}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Add item */}
            <BigCard label="ADD ITEM">
              <div style={{display:"flex",gap:10,marginBottom:10}}>
                <input type="text" placeholder="e.g. chicken breast, Greek yogurt..."
                  value={shopInput} onChange={e=>setShopInput(e.target.value)}
                  onKeyDown={e=>e.key==="Enter"&&addShopItem()}
                  style={{flex:1,outline:"none",border:"1.5px solid #e8e0d4",borderRadius:12,padding:"11px 13px",
                    fontSize:14,fontFamily:"'DM Mono'",background:"#fafaf5",color:"#1a1a2e",transition:"border 0.2s"}}
                  onFocus={e=>e.target.style.borderColor="#E8643A"}
                  onBlur={e=>e.target.style.borderColor="#e8e0d4"}/>
                <button className="btn" onClick={()=>addShopItem()}
                  style={{padding:"11px 18px",borderRadius:12,background:"#1a1a2e",color:"white",fontSize:22,fontWeight:700,lineHeight:1,flexShrink:0,boxShadow:"0 4px 14px rgba(26,26,46,0.2)"}}>
                  +
                </button>
              </div>
              {/* Quick category buttons */}
              {shopInput.trim()&&(
                <div>
                  <p style={{fontSize:10,letterSpacing:2,color:"#b0a898",fontFamily:"'DM Mono'",textTransform:"uppercase",marginBottom:7}}>
                    AUTO: <span style={{color:"#E8643A"}}>{(SHOP_CATS.find(c=>c.id===detectCategory(shopInput))||SHOP_CATS[7]).label}</span> — or pick manually:
                  </p>
                  <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                    {SHOP_CATS.map(cat=>(
                      <button key={cat.id} className="btn" onClick={()=>addShopItem(cat.id)}
                        style={{padding:"5px 10px",borderRadius:20,fontSize:11,fontFamily:"'DM Mono'",
                          background:cat.bg,color:cat.color,border:`1px solid ${cat.color}30`}}>
                        {cat.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </BigCard>

            {/* Empty state */}
            {shopItems.length===0&&(
              <div style={{textAlign:"center",padding:"48px 20px"}}>
                <div style={{fontSize:48,marginBottom:12}}>🛒</div>
                <p style={{fontFamily:"'Syne'",fontSize:18,fontWeight:700,color:"#d0c8bc",marginBottom:6}}>List is empty</p>
                <p style={{fontSize:12,fontFamily:"'DM Mono'",color:"#c0b8b0"}}>Items are auto-sorted into sections as you add them</p>
              </div>
            )}

            {/* Categorised list — pending items */}
            {shopItems.filter(i=>!i.done).length>0&&(
              <div style={{marginBottom:16}}>
                {SHOP_CATS.map(cat=>{
                  const effectiveCat = (i) => (i.cat && SHOP_CATS.find(c=>c.id===i.cat)) ? i.cat : "other";
                  const catItems = shopItems.filter(i=>!i.done && effectiveCat(i)===cat.id);
                  if (catItems.length===0) return null;
                  return (
                    <div key={cat.id} style={{marginBottom:12}}>
                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:7}}>
                        <div style={{height:2,flex:1,background:`linear-gradient(90deg,${cat.color},transparent)`,borderRadius:2}}/>
                        <span style={{fontSize:12,fontFamily:"'DM Mono'",color:cat.color,fontWeight:500,whiteSpace:"nowrap"}}>{cat.label}</span>
                        <span style={{fontSize:10,fontFamily:"'DM Mono'",color:"#b0a898"}}>{catItems.length}</span>
                      </div>
                      <div style={{background:"white",borderRadius:14,border:`1.5px solid ${cat.color}25`,overflow:"hidden"}}>
                        {catItems.map((item,idx)=>(
                          <div key={item.id} className="row"
                            style={{display:"flex",alignItems:"center",gap:12,padding:"13px 14px",
                              borderBottom:idx<catItems.length-1?"1px solid #f5f0e8":"none",background:"white"}}
                            onClick={()=>toggleShopItem(item.id)}>
                            <div style={{width:24,height:24,borderRadius:"50%",flexShrink:0,
                              border:`2px solid ${cat.color}60`,background:"white",display:"flex",alignItems:"center",justifyContent:"center"}}/>
                            <span style={{flex:1,fontSize:14,fontFamily:"'DM Mono'",color:"#1a1a2e"}}>{item.text}</span>
                            {/* Re-categorise button */}
                            <select defaultValue={item.cat} onChange={e=>{e.stopPropagation();setShopItems(p=>p.map(i=>i.id===item.id?{...i,cat:e.target.value}:i));}}
                              onClick={e=>e.stopPropagation()}
                              style={{fontSize:10,border:"1px solid #e8e0d4",borderRadius:6,padding:"2px 4px",fontFamily:"'DM Mono'",color:"#a0a0b0",background:"white",cursor:"pointer",maxWidth:70}}>
                              {SHOP_CATS.map(c=><option key={c.id} value={c.id}>{c.label.split(" ").slice(1).join(" ")}</option>)}
                            </select>
                            <button className="btn" onClick={e=>{e.stopPropagation();deleteShopItem(item.id);}}
                              style={{fontSize:15,color:"#e0d8d0",background:"none",border:"none",padding:"2px 6px",lineHeight:1}}>✕</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Got it section */}
            {shopItems.filter(i=>i.done).length>0&&(
              <div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                  <Label text="GOT IT ✓" style={{marginBottom:0}}/>
                  <button className="btn" onClick={clearDoneItems}
                    style={{fontSize:10,color:"#b0a898",background:"none",border:"1px dashed #d8d0c8",borderRadius:8,padding:"4px 10px",fontFamily:"'DM Mono'",letterSpacing:1}}>
                    CLEAR DONE
                  </button>
                </div>
                <div style={{background:"white",borderRadius:14,border:"1.5px solid #f0ece4",overflow:"hidden",opacity:0.65}}>
                  {shopItems.filter(i=>i.done).map((item,idx,arr)=>(
                    <div key={item.id} className="row"
                      style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",
                        borderBottom:idx<arr.length-1?"1px solid #f5f0e8":"none",background:"#fafaf5"}}
                      onClick={()=>toggleShopItem(item.id)}>
                      <div style={{width:24,height:24,borderRadius:"50%",flexShrink:0,background:"#16a34a",
                        border:"2px solid #16a34a",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 2px 8px rgba(22,163,74,0.25)"}}>
                        <span style={{color:"white",fontSize:12,lineHeight:1}}>✓</span>
                      </div>
                      <span style={{flex:1,fontSize:13,fontFamily:"'DM Mono'",color:"#a0a0b0",textDecoration:"line-through"}}>{item.text}</span>
                      <span style={{fontSize:10,fontFamily:"'DM Mono'",color:"#c0b8b0"}}>{SHOP_CATS.find(c=>c.id===item.cat)?.label.split(" ")[0]}</span>
                      <button className="btn" onClick={e=>{e.stopPropagation();deleteShopItem(item.id);}}
                        style={{fontSize:15,color:"#e0d8d0",background:"none",border:"none",padding:"2px 6px",lineHeight:1}}>✕</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* All done */}
            {shopItems.length>0&&shopItems.every(i=>i.done)&&(
              <div style={{background:"linear-gradient(135deg,#16a34a,#4ade80)",borderRadius:16,padding:"20px",textAlign:"center",marginTop:14,boxShadow:"0 8px 24px rgba(22,163,74,0.3)"}}>
                <div style={{fontSize:36,marginBottom:6}}>🛒✅</div>
                <p style={{fontFamily:"'Syne'",fontSize:18,fontWeight:700,color:"white"}}>Shopping done!</p>
                <p style={{fontSize:12,fontFamily:"'DM Mono'",color:"rgba(255,255,255,0.75)",marginTop:4}}>Tap items to uncheck or clear done to start fresh</p>
              </div>
            )}

          </div>
        )}

      </div>
    </div>
  );
}

// ── Reusable components ───────────────────────────────────────────────────────
function Label({text,style={}}) {
  return <p style={{fontSize:10,letterSpacing:3,textTransform:"uppercase",color:"#a0a0b0",marginBottom:10,fontFamily:"'DM Mono'",...style}}>{text}</p>;
}
function BigCard({label,sub,accent,right,children}) {
  return (
    <div style={{background:"white",borderRadius:20,border:"1.5px solid #f0ece4",padding:"16px 16px",marginBottom:14,boxShadow:"0 2px 12px rgba(26,26,46,0.04)"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:sub?4:12}}>
        <p style={{fontSize:10,letterSpacing:3,textTransform:"uppercase",color:"#b0b0c0",fontFamily:"'DM Mono'"}}>{label}</p>
        {right}
      </div>
      {sub&&<p style={{fontSize:11,color:"#c0b8b0",fontFamily:"'DM Mono'",marginBottom:12}}>{sub}</p>}
      {children}
    </div>
  );
}
function Pill({color,bg,text}) {
  return <div style={{background:bg,border:`1.5px solid ${color}30`,borderRadius:14,padding:"12px 14px",marginBottom:14,fontSize:12,fontFamily:"'DM Mono'",color:color,lineHeight:1.6}}>{text}</div>;
}
