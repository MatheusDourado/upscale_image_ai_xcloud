/* BEGIN FRAME PACING */
// Keep the upstream source intact. Apply the cap to every canvas renderer.
(() => {
 const proto=BaseCanvasPlayer.prototype;
 proto.setTargetFps=function(target){
  this.targetFps=target;
  this.frameInterval=target>0?1000/target:0;
  this.bxNextFrameAt=null;
 };
 proto.shouldDraw=function(){
  if(this.targetFps>=60)return true;
  if(this.targetFps<=0)return false;
  const now=performance.now(),interval=this.frameInterval;
  if(this.bxNextFrameAt==null||now-this.bxNextFrameAt>interval){
   // Start immediately, and discard old deadlines after a long interruption.
   this.bxNextFrameAt=now+interval;
   return true;
  }
  // A small scheduling tolerance accepts early callbacks without moving the
  // next deadline. The cap stays at its requested average instead of drifting.
  if(now<this.bxNextFrameAt-2)return false;
  this.bxNextFrameAt+=interval;
  return true;
 };
})();
/* END FRAME PACING */
