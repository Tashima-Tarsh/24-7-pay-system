// Dependency-free perspective scene; visual enhancement only. Main content never relies on WebGL.
const canvas=document.getElementById('network-scene');
const reduce=matchMedia('(prefers-reduced-motion: reduce)');
if(canvas&&!reduce.matches){
  const context=canvas.getContext('2d',{alpha:true});
  if(context){
    const p=Array.from({length:84},(_,i)=>{
      const a=i*2.39996, y=1-2*(i+.5)/84,r=Math.sqrt(1-y*y);
      return {x:Math.cos(a)*r,y,z:Math.sin(a)*r,phase:(i*0.173)%6.28};
    });
    let frame=0,last=0,w=0,h=0,active=true,angle=.1;
    const observer=new IntersectionObserver(entries=>{active=entries[0].isIntersecting;},{threshold:0});
    observer.observe(canvas);
    function size(){const dpr=Math.min(devicePixelRatio||1,1.6);w=canvas.clientWidth;h=canvas.clientHeight;canvas.width=Math.max(1,Math.floor(w*dpr));canvas.height=Math.max(1,Math.floor(h*dpr));context.setTransform(dpr,0,0,dpr,0,0);}
    const projected=(pt,t)=>{
      const c=Math.cos(t),s=Math.sin(t),x=pt.x*c+pt.z*s,z=pt.z*c-pt.x*s;
      const tilt=.31,y=pt.y*Math.cos(tilt)-z*Math.sin(tilt),dz=pt.y*Math.sin(tilt)+z*Math.cos(tilt);
      const depth=2.9+dz,scale=Math.min(w,h)*.57/depth;
      return{x:w/2+x*scale,y:h/2+y*scale,z:dz,opacity:Math.max(.15,Math.min(1,(dz+1.2)/2.4))};
    };
    function draw(t){
      if(!active||document.hidden){requestAnimationFrame(draw);return;}
      if(t-last<32){requestAnimationFrame(draw);return;}last=t;
      context.clearRect(0,0,w,h);const v=p.map(item=>projected(item,angle+t*.000065));
      context.lineWidth=.65;
      for(let i=0;i<v.length;i++){
        const point=v[i];
        if(i%4===0)for(let j=i+1;j<Math.min(i+18,v.length);j++){
          const other=v[j],distance=Math.hypot(point.x-other.x,point.y-other.y);
          if(distance<125){context.strokeStyle='rgba(104,191,242,'+(.15*(1-distance/125)*Math.min(point.opacity,other.opacity))+')';context.beginPath();context.moveTo(point.x,point.y);context.lineTo(other.x,other.y);context.stroke();}
        }
        const radius=point.z>0?2:1.1;
        context.fillStyle=i%6===0?'rgba(146,145,255,'+point.opacity+')':'rgba(86,213,246,'+point.opacity+')';
        context.beginPath();context.arc(point.x,point.y,radius,0,Math.PI*2);context.fill();
      }
      context.save();context.translate(w/2,h/2);context.strokeStyle='rgba(93,179,243,.12)';context.lineWidth=1;
      for(const k of [.42,.55,.68]){context.beginPath();context.ellipse(0,0,Math.min(w,h)*k,Math.min(w,h)*k*.48,Math.sin(t*.00008)*.36,0,Math.PI*2);context.stroke();}
      context.restore();requestAnimationFrame(draw);
    }
    new ResizeObserver(size).observe(canvas);size();
    window.addEventListener('pointermove',ev=>{angle=.1+Math.max(-.2,Math.min(.2,(ev.clientX/window.innerWidth-.5)*.4));},{passive:true});
    requestAnimationFrame(draw);
  }
}
