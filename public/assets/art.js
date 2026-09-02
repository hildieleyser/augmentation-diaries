(function(){
  function rng(seed){return function(){seed|=0;seed=seed+0x6D2B79F5|0;var t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}

  function fit(cv, ratio){
    var w = cv.parentNode.clientWidth || 600;
    var h = Math.round(w / ratio);
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    cv.style.height = h + 'px';
    var ctx = cv.getContext('2d');
    ctx.setTransform(dpr,0,0,dpr,0,0);
    return {ctx:ctx, w:w, h:h};
  }

  // smooth value noise
  function noise(r, n){
    var pts=[]; for(var i=0;i<n;i++) pts.push(r());
    return function(t){
      var x=t*(n-1), i=Math.floor(x), f=x-i;
      var a=pts[Math.max(0,Math.min(n-1,i))], b=pts[Math.max(0,Math.min(n-1,i+1))];
      var s=f*f*(3-2*f);
      return a+(b-a)*s;
    };
  }

  function drawWave(){
    var cv=document.getElementById('wave'); if(!cv) return;
    var f=fit(cv, 4.4), ctx=f.ctx, w=f.w, h=f.h, mid=h*0.5;
    ctx.clearRect(0,0,w,h);
    var r=rng(20260902);
    var env1=noise(rng(7), 26), env2=noise(rng(31), 90), env3=noise(rng(53), 300);
    var step=3, bars=Math.floor(w/step);
    for(var i=0;i<bars;i++){
      var t=i/bars;
      var edge=Math.min(1, Math.min(t,1-t)*7);
      var a=env1(t)*0.66 + env2(t)*0.26 + env3(t)*0.14;
      var speech=Math.pow(a,1.5)*(0.55+0.45*env2(t*1.7%1));
      var amp=speech*h*0.62*edge;
      if(r()<0.06) amp*=0.25;
      var g=ctx.createLinearGradient(0,mid-amp,0,mid+amp*0.75);
      g.addColorStop(0,'rgba(185,204,245,0.16)');
      g.addColorStop(0.5,'rgba(214,228,255,0.95)');
      g.addColorStop(1,'rgba(150,172,214,0.20)');
      ctx.fillStyle=g;
      ctx.fillRect(i*step, mid-amp, 1.35, amp+amp*0.72);
    }
    ctx.fillStyle='rgba(185,204,245,0.28)';
    ctx.fillRect(0, mid, w, 0.6);
  }

  function drawPhosphenes(){
    var cv=document.getElementById('art1'); if(!cv) return;
    var f=fit(cv, 1.34), ctx=f.ctx, w=f.w, h=f.h;
    ctx.fillStyle='#0C0E13'; ctx.fillRect(0,0,w,h);
    var r=rng(4211);
    var cols=13, rows=10;
    var padX=w*0.09, padY=h*0.11;
    var gx=(w-padX*2)/(cols-1), gy=(h-padY*2)/(rows-1);
    for(var y=0;y<rows;y++){
      for(var x=0;x<cols;x++){
        if(r()<0.17) continue;
        var cx=padX+x*gx+(r()-0.5)*gx*0.28;
        var cy=padY+y*gy+(r()-0.5)*gy*0.28;
        var dx=(x/(cols-1))-0.42, dy=(y/(rows-1))-0.5;
        var fall=1-Math.min(1, Math.sqrt(dx*dx+dy*dy)*1.45);
        var inten=Math.max(0.05, fall*(0.45+r()*0.7));
        var rad=Math.min(gx,gy)*(0.42+r()*0.5);
        var g=ctx.createRadialGradient(cx,cy,0,cx,cy,rad);
        g.addColorStop(0,'rgba(226,236,255,'+(inten*0.95).toFixed(3)+')');
        g.addColorStop(0.35,'rgba(176,199,245,'+(inten*0.42).toFixed(3)+')');
        g.addColorStop(1,'rgba(120,146,200,0)');
        ctx.fillStyle=g;
        ctx.beginPath(); ctx.arc(cx,cy,rad,0,6.2832); ctx.fill();
      }
    }
  }

  // art2: the load moving across to the sound side over years of walking
  function drawLoad(){
    var cv=document.getElementById('art2'); if(!cv) return;
    var f=fit(cv, 1.34), ctx=f.ctx, w=f.w, h=f.h;
    ctx.fillStyle='#0C0E13'; ctx.fillRect(0,0,w,h);
    var r=rng(3307);
    var mid=h*0.46, padX=w*0.11, span=w-padX*2, N=26;
    // the sound side, year on year
    ctx.beginPath();
    for(var j=0;j<=N;j++){
      var tt=j/N, xx=padX+tt*span;
      var yy=mid+h*(0.13+0.30*Math.pow(tt,1.5));
      if(j===0) ctx.moveTo(xx,yy); else ctx.lineTo(xx,yy);
    }
    ctx.strokeStyle='rgba(228,168,104,0.30)'; ctx.lineWidth=1; ctx.stroke();

    for(var i=0;i<N;i++){
      var t=i/(N-1);
      var x=padX+t*span;
      var jitter=0.92+r()*0.16;
      var up=h*0.15*jitter;
      var dn=h*(0.13+0.30*Math.pow(t,1.5))*jitter;
      var gu=ctx.createLinearGradient(0,mid-up,0,mid);
      gu.addColorStop(0,'rgba(185,204,245,0.14)');
      gu.addColorStop(1,'rgba(202,220,255,0.80)');
      ctx.fillStyle=gu; ctx.fillRect(x,mid-up,4.4,up);
      var gd=ctx.createLinearGradient(0,mid,0,mid+dn);
      gd.addColorStop(0,'rgba(232,172,106,0.88)');
      gd.addColorStop(1,'rgba(198,104,74,0.12)');
      ctx.fillStyle=gd; ctx.fillRect(x,mid,4.4,dn);
    }
    ctx.fillStyle='rgba(237,236,232,0.30)';
    ctx.fillRect(padX*0.6,mid,w-padX*1.2,0.7);
  }

  // art3: the same protocol run in the quiet room, then in the field
  function drawRooms(){
    var cv=document.getElementById('art3'); if(!cv) return;
    var f=fit(cv, 1.34), ctx=f.ctx, w=f.w, h=f.h;
    ctx.fillStyle='#0C0E13'; ctx.fillRect(0,0,w,h);
    var r=rng(6620);
    var pad=w*0.075, gap=w*0.05;
    var leftW=(w-pad*2-gap)*0.36, rightW=(w-pad*2-gap)*0.64;
    var top=h*0.16, bh=h*0.68;

    function trace(x0,width,y0,height,amp,alpha,lw){
      ctx.beginPath();
      for(var i=0;i<=180;i++){
        var t=i/180;
        var v=Math.sin(t*11.5)*0.5+Math.sin(t*27.3+1.2)*0.28+Math.sin(t*4.1+0.4)*0.34;
        var y=y0+height/2 - v*amp;
        if(i===0) ctx.moveTo(x0+t*width,y); else ctx.lineTo(x0+t*width,y);
      }
      ctx.strokeStyle='rgba(214,228,255,'+alpha+')';
      ctx.lineWidth=lw; ctx.stroke();
    }

    // the quiet room
    ctx.strokeStyle='rgba(150,166,200,0.22)'; ctx.lineWidth=1;
    ctx.strokeRect(pad, top, leftW, bh);
    trace(pad+leftW*0.06, leftW*0.88, top, bh, bh*0.10, 0.85, 1.4);

    // the field: the same trace, with everything else the day contains
    var rx=pad+leftW+gap;
    ctx.strokeStyle='rgba(150,166,200,0.22)';
    ctx.strokeRect(rx, top, rightW, bh);
    ctx.save();
    ctx.beginPath(); ctx.rect(rx,top,rightW,bh); ctx.clip();
    for(var k=0;k<26;k++){
      var yy=top+bh*(0.06+r()*0.88);
      ctx.beginPath();
      for(var i=0;i<=140;i++){
        var t=i/140;
        var v=Math.sin(t*(9+r()*0.4)+k)*0.6+Math.sin(t*(40+k)+k*1.7)*0.5;
        var y=yy - v*bh*0.045;
        if(i===0) ctx.moveTo(rx+t*rightW,y); else ctx.lineTo(rx+t*rightW,y);
      }
      ctx.strokeStyle='rgba(228,168,104,'+(0.05+r()*0.10).toFixed(3)+')';
      ctx.lineWidth=0.8; ctx.stroke();
    }
    for(var m=0;m<160;m++){
      var mx=rx+r()*rightW, my=top+r()*bh;
      ctx.fillStyle='rgba(232,204,170,'+(0.05+r()*0.16).toFixed(3)+')';
      ctx.fillRect(mx,my,1.1,1.1);
    }
    trace(rx+rightW*0.03, rightW*0.94, top, bh, bh*0.10, 0.92, 1.4);
    ctx.restore();
  }

  function all(){ drawWave(); drawPhosphenes(); drawLoad(); drawRooms(); }
  all();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(all);
  var t; window.addEventListener('resize', function(){ clearTimeout(t); t=setTimeout(all,180); });
})();
