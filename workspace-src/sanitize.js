// Central safety boundary for the HTML-based legacy renderer. Script execution remains
// blocked by CSP, and every HTML sink is sanitized before insertion.
(()=>{let inside=false;const descriptor=Object.getOwnPropertyDescriptor(Element.prototype,'innerHTML');
 const clean=html=>{if(inside)return html;inside=true;try{return DOMPurify.sanitize(String(html),{FORBID_TAGS:['script','iframe','object','embed','style','link','meta'],FORBID_ATTR:['srcdoc'],ALLOW_DATA_ATTR:true,SANITIZE_DOM:false});}finally{inside=false;}};
 Object.defineProperty(Element.prototype,'innerHTML',{...descriptor,set(value){descriptor.set.call(this,clean(value));}});
 const adjacent=Element.prototype.insertAdjacentHTML;Element.prototype.insertAdjacentHTML=function(position,html){return adjacent.call(this,position,clean(html));};
})();
