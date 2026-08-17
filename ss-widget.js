function ssWhenReady(){
  if(window.__ssStarted)return;
  var totalEl=document.getElementById('ss-total');
  var rowEls=[document.getElementById('ss-r0'),document.getElementById('ss-r1'),document.getElementById('ss-r2'),document.getElementById('ss-r3')];
  var labelEls=[document.getElementById('ss-l0'),document.getElementById('ss-l1'),document.getElementById('ss-l2'),document.getElementById('ss-l3')];
  var amtEls=[document.getElementById('ss-a0'),document.getElementById('ss-a1'),document.getElementById('ss-a2'),document.getElementById('ss-a3')];
  if(!totalEl||!rowEls[0]){requestAnimationFrame(ssWhenReady);return;}
  window.__ssStarted=true;
  var combos=[
    [["Mechanical royalty",412.10],["Performance royalty",4820.40],["Sync royalty",68500.00],["Backend residual",94000.05]],
    [["Streaming payout",52300.55],["Publishing share",145200.20],["Sync licensing",3400000.00]],
    [["Suspense release",128450.00],["Working interest",1830075.50]],
    [["Box office share",890300.30],["Home video residual",76500.15],["Streaming residual",2150000.80]],
    [["Patent licensing fee",215000.00],["Sublicense royalty",64050.50]],
    [["Mineral royalty",975400.40],["Overriding interest",312100.10],["Lease bonus",5000000.00]],
    [["Performance rights",132600.60],["Neighboring rights",950300.30],["Mechanical share",210000.00]],
    [["Trademark licensing",480000.00],["Merchandise royalty",1275900.90]],
    [["Catalog acquisition",1250000.00],["Backend points",6100302.10]],
    [["Well interest payout",1450000.00],["Title curative release",220000.00]]
  ];
  var ci=0;
  function run(){
    var combo=combos[ci%combos.length];ci++;
    totalEl.style.color='oklch(0.6 0.19 145)';
    for(var h=combo.length;h<4;h++){rowEls[h].style.opacity='0';labelEls[h].textContent='';amtEls[h].textContent='';}
    var sum=0;
    combo.forEach(function(item,i){
      rowEls[i].style.opacity='0';
      setTimeout(function(){
        labelEls[i].textContent=item[0];
        amtEls[i].textContent='+$'+item[1].toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
        rowEls[i].style.opacity='1';
        sum+=item[1];
      },i*450+120);
    });
    setTimeout(function(){
      totalEl.textContent='$'+sum.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
      var flashes=0;
      var flashInt=setInterval(function(){
        totalEl.style.color=flashes%2===0?'#000':'oklch(0.6 0.19 145)';
        flashes++;
        if(flashes>=4){clearInterval(flashInt);totalEl.style.color='oklch(0.6 0.19 145)';}
      },220);
    },combo.length*450+300);
    setTimeout(run,combo.length*450+2000);
  }
  run();
}
ssWhenReady();
if(document.readyState==='complete'){setTimeout(ssWhenReady,50);}else{window.addEventListener('load',function(){setTimeout(ssWhenReady,50);});}
setTimeout(ssWhenReady,300);
setTimeout(ssWhenReady,1000);
setTimeout(ssWhenReady,2000);
