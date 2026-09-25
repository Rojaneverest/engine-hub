try {boot();} catch(error) {
  renderer=null;$('#engineView').classList.add('engine-unavailable');
  $('#stage').innerHTML='<div style="padding:30px;max-width:600px"><h2>The 3D view could not start</h2><p>This browser could not create the graphics renderer. You can still use the Lab experiments and read the glossary in Discover.</p><button class="btn" id="fallbackLab">Open Lab</button></div>';
  $('#fallbackLab').onclick=()=>showTab('lab');
  console.error('Engine renderer unavailable:',error);
}
showTab('discover');restoreHash();
