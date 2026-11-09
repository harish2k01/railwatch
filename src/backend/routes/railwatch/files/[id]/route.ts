import {storedPlanner} from "@/lib/workspace-storage";
import { getFeaturePolicy } from "@/lib/settings";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ticketBytes,ticketStorage, sealTicket } from "@/lib/ticket-storage";
import { ApiError,assertSameOrigin,jsonData,routeError,noStoreHeaders } from "@/lib/http";
import { attachmentSchema } from "@/lib/travel-planner";
type Context={params:Promise<{id:string}>};
const MAX=10485760;
/** Streams an encrypted-storage original only to its owning account. */
export async function GET(request:Request,context:Context){try{const user=await requireUser();const {id}=await context.params;const file=await ticketStorage.get(prisma,user.id,id);if(!file)throw new ApiError(404,"Ticket file not found.");const bytes=new Uint8Array(file.bytes);return new Response(bytes,{headers:{...noStoreHeaders(),"Content-Type":file.type,"Content-Length":String(bytes.length),"Content-Disposition":`attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,"X-Content-Type-Options":"nosniff"}});}catch(e){return routeError(e,request);}}
/** Validates file contents, ownership, and quota before storing the encrypted original. */
export async function PUT(request:Request,context:Context){try{
  assertSameOrigin(request);const user=await requireUser();const {id}=await context.params;
  if(!(await getFeaturePolicy()).ticketUploadsEnabled)throw new ApiError(403,"Ticket uploads are disabled by the administrator.","FEATURE_DISABLED");
  if(!/^[A-Za-z0-9_-]{1,120}$/.test(id))throw new ApiError(400,"Invalid attachment identifier.");
  const size=Number(request.headers.get("content-length"));if(size>MAX)throw new ApiError(413,"Tickets must be smaller than 10 MB.");
  const chunks:Uint8Array[]=[];let length=0;const reader=request.body?.getReader();if(!reader)throw new ApiError(400,"File content is required.");
  while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>MAX){await reader.cancel();throw new ApiError(413,"Tickets must be smaller than 10 MB.");}chunks.push(value);}
  const bytes=Buffer.concat(chunks);const type=request.headers.get("content-type")??"";
  if(type!=="application/pdf")throw new ApiError(400,"Only PDF originals can be stored. Images and QR codes are used only to extract details.","PDF_ONLY");
  const meta=attachmentSchema.parse({id,name:decodeURIComponent(request.headers.get("x-file-name")??"ticket"),type,size:bytes.length,createdAt:new Date().toISOString()});
  if(!bytes.subarray(0,1024).includes(Buffer.from("%PDF-")))throw new ApiError(400,"The file contents do not match the PDF type.");
  // Encrypt before locking the account row; the transaction then only checks quota and inserts.
  const encrypted=sealTicket(bytes);
  await prisma.$transaction(async tx=>{await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${user.id} FOR UPDATE`;const old=await tx.railFile.findUnique({where:{userId_id:{userId:user.id,id}},select:{name:true,type:true,size:true,payloadBytes:true}});if(old){if(old.name!==meta.name||old.type!==meta.type||old.size!==meta.size||!ticketBytes(old).equals(bytes))throw new ApiError(409,"This attachment already exists. Upload it using a new identifier.");return;}
    if((await ticketStorage.usage(tx,user.id))+bytes.length>250_000_000)throw new ApiError(413,"Your ticket storage limit is 250 MB. Remove unused files first.");
    await ticketStorage.put(tx,user.id,id,{name:meta.name,type:meta.type,bytes,encrypted});
  },{maxWait:10_000,timeout:20_000});return jsonData(meta);
}catch(e){return routeError(e,request);}}
/** Deletes an unlinked original after checking account ownership and workspace references. */
export async function DELETE(request:Request,context:Context){try{assertSameOrigin(request);const user=await requireUser();const {id}=await context.params;await prisma.$transaction(async tx=>{await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${user.id} FOR UPDATE`;const workspace=await tx.railWorkspace.findUnique({where:{userId:user.id}});if(workspace&&(workspace.storageVersion===2?Boolean((await tx.railFile.findFirst({where:{userId:user.id,id},select:{journeyId:true}}))?.journeyId):(await storedPlanner(tx,user.id,workspace)).journeys.some(j=>j.attachments?.some(f=>f.id===id))))throw new ApiError(409,"Remove this attachment from its journey before deleting the original.");await ticketStorage.delete(tx,user.id,id);});return jsonData({deleted:true});}catch(e){return routeError(e,request);}}
