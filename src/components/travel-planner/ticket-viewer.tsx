"use client";
import {useEffect,useRef,useState} from "react";
import type {PDFDocumentProxy,RenderTask} from "pdfjs-dist";
import type {PDFViewer,EventBus} from "pdfjs-dist/web/pdf_viewer.mjs";
import {ChevronLeft,ChevronRight,Download,ExternalLink,Maximize,Minus,PanelLeft,Plus,Search,X} from "lucide-react";
import Image from "next/image";
import {downloadTicketFile,getTicketFile} from "@/lib/ticket-files";
import type {TicketAttachment} from "@/lib/travel-planner";
import {Modal} from "./form-ui";
import {ActionMenu} from "./action-menu";
import "pdfjs-dist/web/pdf_viewer.css";
import c from "./ticket-viewer.module.css";
import s from "./planner.module.css";

/** Renders a small page preview only when its thumbnail approaches the visible sidebar. */
function Thumbnail({pdf,page,current,select}:{pdf:PDFDocumentProxy;page:number;current:boolean;select:()=>void}){
  const ref=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{let render:RenderTask|undefined,live=true;
    const observer=new IntersectionObserver(entries=>{if(!entries.some(e=>e.isIntersecting))return;observer.disconnect();
      void pdf.getPage(page).then(item=>{if(!live||!ref.current)return;const viewport=item.getViewport({scale:116/item.getViewport({scale:1}).width});ref.current.width=viewport.width;ref.current.height=viewport.height;render=item.render({canvas:ref.current,viewport});return render.promise;}).catch(()=>{});
    },{rootMargin:"100px"});if(ref.current)observer.observe(ref.current);
    return()=>{live=false;observer.disconnect();render?.cancel();};
  },[pdf,page]);
  return <button className={c.thumb} type="button" aria-label={`Go to page ${page}`} aria-current={current} onClick={select}><canvas ref={ref} aria-hidden="true"/><span>{page}</span></button>;
}

/** Opens only an account-owned original in a continuous, searchable document workspace. */
export function TicketViewer({file,blob:staged,close}:{file:TicketAttachment;blob?:Blob;close:()=>void}){
  const container=useRef<HTMLDivElement>(null),surface=useRef<HTMLDivElement>(null),reader=useRef<PDFViewer|null>(null),bus=useRef<EventBus|null>(null),searchInput=useRef<HTMLInputElement>(null);
  const [pdf,setPdf]=useState<PDFDocumentProxy>(),[original,setOriginal]=useState<Blob>(),[url,setUrl]=useState(""),[error,setError]=useState(""),[page,setPage]=useState(1),[scale,setScale]=useState(100),[thumbs,setThumbs]=useState(false),[search,setSearch]=useState(false),[query,setQuery]=useState(""),[matches,setMatches]=useState({current:0,total:0}),[ready,setReady]=useState(false);
  useEffect(()=>{let live=true,objectUrl="";let task:ReturnType<typeof import("pdfjs-dist").getDocument>|undefined;let resize:ResizeObserver|undefined;const controller=new AbortController();
    void(async()=>{try{
      const blob=staged??await getTicketFile(file.id);if(!blob)throw new Error("This original ticket is no longer available.");if(!live)return;
      setOriginal(blob);objectUrl=URL.createObjectURL(blob);setUrl(objectUrl);
      if(file.type!=="application/pdf"){setReady(true);return;}
      const pdfjs=await import("pdfjs-dist"),ui=await import("pdfjs-dist/web/pdf_viewer.mjs");
      if(!live||!container.current||!surface.current)return;
      pdfjs.GlobalWorkerOptions.workerSrc=`/railwatch/pdf.worker.min.mjs?v=${pdfjs.version}`;
      const events=new ui.EventBus(),links=new ui.PDFLinkService({eventBus:events,externalLinkTarget:2,externalLinkRel:"noopener noreferrer"}),find=new ui.PDFFindController({eventBus:events,linkService:links});
      const options={container:container.current,viewer:surface.current,eventBus:events,linkService:links,findController:find,textLayerMode:1,annotationMode:1,removePageBorders:true,maxCanvasPixels:16777216,abortSignal:controller.signal};
      const viewer=new ui.PDFViewer(options);
      links.setViewer(viewer);reader.current=viewer;bus.current=events;
      events.on("pagesinit",()=>{if(live){viewer.currentScaleValue="page-width";setReady(true);}});
      events.on("pagechanging",({pageNumber}:{pageNumber:number})=>{if(live)setPage(pageNumber);});
      events.on("scalechanging",({scale}:{scale:number})=>{if(live)setScale(Math.round(scale*100));});
      events.on("updatefindmatchescount",({matchesCount}:{matchesCount:{current:number;total:number}})=>{if(live)setMatches(matchesCount);});
      events.on("updatefindcontrolstate",({state}:{state:number})=>{if(live&&state===1)setMatches({current:0,total:0});});
      events.on("pagerendered",({pageNumber}:{pageNumber:number})=>{viewer.getPageView(pageNumber-1)?.div.querySelector("canvas")?.setAttribute("data-rendered-page",String(pageNumber));});
      task=pdfjs.getDocument({data:new Uint8Array(await blob.arrayBuffer()),useSystemFonts:true,cMapUrl:"/railwatch/cmaps/",cMapPacked:true,standardFontDataUrl:"/railwatch/standard_fonts/",wasmUrl:"/railwatch/wasm/"});
      const document=await task.promise;if(!live)return;setPdf(document);links.setDocument(document);viewer.setDocument(document);
      const viewport=container.current;
      let width=viewport.clientWidth;
      resize=new ResizeObserver(()=>{if(!live||viewport.clientWidth===width)return;width=viewport.clientWidth;const preset=viewer.currentScaleValue;if(["page-width","page-fit","auto"].includes(preset))viewer.currentScaleValue=preset;});
      resize.observe(viewport);
      viewport.addEventListener("wheel",e=>{if(!e.ctrlKey)return;e.preventDefault();viewer.currentScale=Math.min(4,Math.max(.3,viewer.currentScale*Math.exp(-e.deltaY*.002)));},{passive:false,signal:controller.signal});
      let pinch:{distance:number;scale:number}|undefined;
      const distance=(event:TouchEvent)=>Math.hypot(event.touches[0].clientX-event.touches[1].clientX,event.touches[0].clientY-event.touches[1].clientY);
      viewport.addEventListener("touchstart",e=>{if(e.touches.length===2){pinch={distance:distance(e),scale:viewer.currentScale};}},{passive:true,signal:controller.signal});
      viewport.addEventListener("touchmove",e=>{if(e.touches.length===2&&pinch){e.preventDefault();viewer.currentScale=Math.min(4,Math.max(.3,pinch.scale*distance(e)/pinch.distance));}},{passive:false,signal:controller.signal});
      viewport.addEventListener("touchend",()=>{pinch=undefined;},{passive:true,signal:controller.signal});
    }catch(e){if(live)setError(e instanceof Error?e.message:"Could not open this ticket.");}})();
    return()=>{live=false;resize?.disconnect();controller.abort();reader.current?.cleanup();reader.current=null;bus.current=null;void task?.destroy();if(objectUrl)setTimeout(()=>URL.revokeObjectURL(objectUrl),60000);};
  },[file.id,file.type,staged]);
  useEffect(()=>{if(search)searchInput.current?.focus();else bus.current?.dispatch("findbarclose",{});},[search]);
  useEffect(()=>{if(!ready)return;bus.current?.dispatch("find",{source:reader.current,type:"",query,caseSensitive:false,entireWord:false,highlightAll:true,findPrevious:false,matchDiacritics:false});},[query,ready]);
  /** Applies bounded viewer zoom so text/canvas layers redraw together at the new scale. */
  function zoom(direction:number){const view=reader.current;if(view)view.currentScale=Math.min(4,Math.max(.3,view.currentScale*(direction>0?1.2:1/1.2)));}
  /** Navigates by document page without replacing the continuous scroll surface. */
  function go(number:number){if(reader.current&&pdf)reader.current.currentPageNumber=Math.max(1,Math.min(pdf.numPages,Math.trunc(number)||1));}
  /** Opens a locally fetched original; no private ticket is sent to an external document service. */
  function native(){if(url)window.open(url,"_blank","noopener,noreferrer");}
  const controlsDisabled=!ready||!pdf;
  return <Modal title="Ticket" subtitle="Original ticket" className={c.dialog} close={close}>
    <div className={c.reader} onKeyDown={event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==="f"){event.preventDefault();setSearch(true);}}}>
      <nav className={c.toolbar} aria-label="Ticket controls"><div className={c.tools}><button type="button" className={c.desktop} aria-label="Toggle page thumbnails" aria-pressed={thumbs} disabled={controlsDisabled} onClick={()=>setThumbs(!thumbs)}><PanelLeft size={18}/></button><input type="number" aria-label="Page number" min={1} max={pdf?.numPages??1} value={page} disabled={controlsDisabled} onChange={e=>go(Number(e.target.value))}/><span>/ {pdf?.numPages??"—"}</span></div>
      <div className={c.tools}><button type="button" aria-label="Zoom out" disabled={controlsDisabled||scale<=30} onClick={()=>zoom(-1)}><Minus size={17}/></button><output className={c.scale} aria-label="Document zoom">{scale}%</output><button type="button" aria-label="Zoom in" disabled={controlsDisabled||scale>=400} onClick={()=>zoom(1)}><Plus size={17}/></button><button type="button" className={c.desktop} aria-label="Fit Width" disabled={controlsDisabled} onClick={()=>{if(reader.current)reader.current.currentScaleValue="page-width";}}><Maximize size={17}/></button></div>
      <div className={c.tools}><button type="button" aria-label="Find in ticket" aria-expanded={search} disabled={controlsDisabled} onClick={()=>setSearch(!search)}><Search size={17}/></button><button type="button" className={c.desktop} aria-label="Download" disabled={!original} onClick={()=>void downloadTicketFile(file,original).catch(e=>setError(e.message))}><Download size={17}/></button><ActionMenu label="Document actions" actions={[{label:"Fit Width",disabled:controlsDisabled,onClick:()=>{if(reader.current)reader.current.currentScaleValue="page-width";}},{label:"Fit Page",disabled:controlsDisabled,onClick:()=>{if(reader.current)reader.current.currentScaleValue="page-fit";}},{label:"Rotate page",disabled:controlsDisabled,onClick:()=>{if(reader.current)reader.current.pagesRotation=(reader.current.pagesRotation+90)%360;}},{label:"Download original",disabled:!original,onClick:()=>void downloadTicketFile(file,original).catch(e=>setError(e.message))},{label:"Open in browser / print",disabled:!url,onClick:native}]}/></div></nav>
      {search&&<div className={c.search}><Search size={17}/><input ref={searchInput} type="search" value={query} onChange={e=>setQuery(e.target.value)} aria-label="Find in document" placeholder="Find in document"/><output aria-live="polite">{query?matches.total?`${matches.current} of ${matches.total}`:"No matches":""}</output><button type="button" aria-label="Previous match" onClick={()=>bus.current?.dispatch("find",{type:"again",query,findPrevious:true})}><ChevronLeft size={17}/></button><button type="button" aria-label="Next match" onClick={()=>bus.current?.dispatch("find",{type:"again",query,findPrevious:false})}><ChevronRight size={17}/></button><button type="button" aria-label="Close search" onClick={()=>setSearch(false)}><X size={17}/></button></div>}
      {error?<div className={c.error} role="alert"><h3>Could not display this ticket</h3><p>{error}</p>{url&&<button type="button" className={s.secondary} onClick={native}><ExternalLink size={16}/>Open original</button>}</div>:<div className={c.layout}>{thumbs&&pdf&&<aside className={`${c.thumbs} ${c.desktop}`} aria-label="Page thumbnails">{Array.from({length:pdf.numPages},(_,i)=><Thumbnail key={i} pdf={pdf} page={i+1} current={page===i+1} select={()=>go(i+1)}/>)}</aside>}<div className={c.stage}>{file.type==="application/pdf"?<div ref={container} className={c.viewport} aria-label="Ticket document"><div ref={surface} className="pdfViewer"/></div>:url?<Image className={c.image} src={url} alt="Original ticket" width={1400} height={1000} unoptimized/>:null}{!ready&&<p className={c.loading} role="status">Loading ticket…</p>}</div></div>}
    </div>
  </Modal>;
}
