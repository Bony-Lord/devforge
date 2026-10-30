'use strict';
importScripts('project-search-model.js');
onmessage=event=>{try{postMessage({id:event.data.id,rows:StudioSearchText.find(event.data.text,event.data.query,event.data.options)});}catch(error){postMessage({id:event.data.id,error:error.message});}};
