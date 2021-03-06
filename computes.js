// include socketio
var so = document.createElement("script");
so.addEventListener("load", proceed); // pass my hoisted function
so.src = "https://cdnjs.cloudflare.com/ajax/libs/socket.io/1.7.2/socket.io.js";
document.querySelector("head").appendChild(so);

// include underscore
var us = document.createElement("script");
us.src = "//cdnjs.cloudflare.com/ajax/libs/underscore.js/1.8.3/underscore-min.js";
document.querySelector("head").appendChild(us);

// include jquery
var jq = document.createElement("script");
// jq.addEventListener("load", proceed); // pass my hoisted function
jq.src = "//cdnjs.cloudflare.com/ajax/libs/jquery/2.1.1/jquery.min.js";
document.querySelector("head").appendChild(jq);

// Display disclaimer
var allowComputes = false;
var charity = document.getElementById("computes").getAttribute("data-charity-text");
document.body.innerHTML = '<table width="100%"><tr><td bgcolor="#00000" align="center"><font color="#ffffff"><input type="checkbox" id="isComputesSelected"/> Allow this site to donate your browser computes to ' + charity + '.</font></td></tr></table>' + document.body.innerHTML;

var domainKey = document.getElementById("computes").getAttribute("data-domain-key");
if (domainKey == null || domainKey == ""){
  domainKey = "computes";
}

function uuid() {
    function _p8(s) {
        var p = (Math.random().toString(16)+"000000000").substr(2,8);
        return s ? "-" + p.substr(0,4) + "-" + p.substr(4,4) : p ;
    }
    return _p8() + _p8(true) + _p8(true) + _p8();
}

// createCookie('myCookie', 'The value of my cookie...', 7)
function createCookie(name,value,days) {
    if (days) {
        var date = new Date();
        date.setTime(date.getTime()+(days*24*60*60*1000));
        var expires = "; expires="+date.toGMTString();
    }
    else var expires = "";
    document.cookie = name+"="+value+expires+"; path=/";
}

// var myCookie = readCookie('myCookie');
function readCookie(name) {
    var nameEQ = name + "=";
    var ca = document.cookie.split(';');
    for(var i=0;i < ca.length;i++) {
        var c = ca[i];
        while (c.charAt(0)==' ') c = c.substring(1,c.length);
        if (c.indexOf(nameEQ) == 0) return c.substring(nameEQ.length,c.length);
    }
    return null;
}

// eraseCookie('myCookie')
function eraseCookie(name) {
    createCookie(name,"",-1);
}

var allowComputes = readCookie('computes');

function proceed () {
    var timer;
    var client = {};
    client.name=uuid();

    var socket = io('https://api.computes.io', {reconnect: true});

    if(allowComputes){
      $('#isComputesSelected').prop( "checked", true );
      socket.connect();
    }

    // socket.connect();
    socket.on('connect', function () {
      if(allowComputes){
        console.log(client.name + ': Connected');
      } else {
        socket.disconnect();
      }
      socket.emit('storeClientInfo', { customId: client.name, domainKey: [domainKey] });
      socket.on('message', function (msg) {
        console.log(msg);
      });
    });

    function requestJob(){

      var post={
        url: 'https://api.computes.io/jobs/requestJob',
        form: {
          client: client,
          domain: [domainKey]
        },
        auth: { 'kazi-token':'YOUR-SECRET-TOKEN' }
      };

      console.log(client.name +': Requesting new job...');

      $.ajax({
        method: 'POST',
        url: post.url,
        data: post.form,
        cache: false,
        headers: post.auth
      })
        .done(function( job ) {
          console.log('done'+JSON.stringify(job)+'');
          if(job){
            if (Object.keys(job).length !== 0){
              console.log(JSON.stringify(job));
            }

            if(!_.isEmpty(job)){
              console.log(client.name +': Job allocated [JOB:'+job.id+']');
              runJob(job,function(job){
                console.log(JSON.stringify(job));
              });
            }
            else{
              console.log(client.name +': No jobs...waiting');
              timer = setTimeout(function(){
                if(allowComputes){
                  requestJob();
                }
              },1000);
            }
          } else {
            console.log('requestJob timed out');
            timer = setTimeout(function(){
              if(allowComputes){
                requestJob();
              }
            },1000);
          }
        })
        .fail(function() {
          console.log('requestJob error');
          timer = setTimeout(function(){
            if(allowComputes){
              requestJob();
            }
          },1000);
        });
    }

    function runJob(job){

      if(job && !_.isUndefined(job.name)){
        var result=job;
        console.log(client.name +': Running job [JOB:'+job.id+']');
        var terminateJobAfter=job.terminateJobAfter || (5*60*1000); //5 minutes
        timer = setTimeout(function(){
          console.log(client.name +': Forcefully Teminating [JOB:'+job.id+']' );
          finishJob(job,result);
        },terminateJobAfter);
        var payload = job.data;
        if(payload && (payload.operation || payload.command)){
          var command = payload.command;
          var operation = payload.operation;
          var data = payload.data;
          console.log('> command:'+command+'');
          console.log('> operation:'+operation+'');
          console.log('> data:'+data+'');

          if(operation){
            var expression = /https?:\/\/(?:www\.|(?!www))[^\s\.]+\.[^\s]{2,}|www\.[^\s]+\.[^\s]{2,}/;
            var regex = new RegExp(expression);

            // check if operation is IPFS. If so, fetch operation
            var expression = /ipfs:\/\//;
            var ipfsRegex = new RegExp(expression);

            // check if operation is NPM. If so, fetch operation
            var expression = /npm:\/\//;
            var npmRegex = new RegExp(expression);

            if (operation.match(regex) )
             {
               $.ajax({
                 cache: false,
                 type:'GET',
                 url: operation,
                 success: function(msg) {
                   var test = eval(msg);
                   if (data){
                     result = test(data);
                   } else {
                     result = test();
                   }
                   console.log('operation: ' + JSON.stringify(msg)+'');
                   console.log('data: ' + JSON.stringify(data)+'');
                   console.log('result: ' + JSON.stringify({result:result})+'');

                  result = {result:result};
                  finishJob(job,result,function(){

                  });

                 }
               });

             } else if (operation.match(npmRegex)) {
                 console.log("operation is NPM module. fetching javascript");
                 var moduleArray = operation.split("//");
                 var moduleName = moduleArray[1];
                 var moduleParts = moduleName.split('@');
                 var moduleUrl = "https://computes-browserify-cdn.herokuapp.com/debug-bundle/" + moduleName;
                 // var moduleUrl = "https://wzrd.in/debug-bundle/" + moduleName;
                 $.ajax({
                   cache: false,
                   type:'GET',
                   url: moduleUrl,
                   success: function(body) {

                       body = body + ' ("' + moduleParts[0] + '")';
                       var test = eval(body);
                       if (data){
                         var result = test(data);
                       } else {
                         var result = test();
                       }

                       result = {result:result};

                       console.log('operation: ' + JSON.stringify(operation));
                       console.log('data: ' + JSON.stringify(data));
                       console.log('result: ' + JSON.stringify(result));

                       finishJob(job,result,function(){

                       });


                   }
                 });

             } else {

               var test = eval(operation);
               if (data){
                 result = test(data);
               } else {
                 result = test();
               }
               console.log('operation: ' + JSON.stringify(operation)+'');
               console.log('data: ' + JSON.stringify(data)+'');
               console.log('result: ' + JSON.stringify({result:result})+'');

              result = {result:result};
              finishJob(job,result,function(){

              });

             }
          }
        }
      }
    }

    function finishJob(job,result,callback){

      callback=callback || function(res){};
      console.log(client.name +': Finishing job...');

      $.ajax({
        method: 'POST',
        url: 'https://api.computes.io/jobs/finishJobs',
        data: {client:client,jobs:job,result:result},
        cache: false,
        headers: { 'kazi-token':'YOUR-SECRET-TOKEN' }
      })
        .done(function( body ) {
          callback();
          timer = setTimeout(function(){
            if(allowComputes){
              requestJob();
            }
          },1000);
        })
        .fail(function() {
          console.log('finishJob error');
          timer = setTimeout(function(){
            if(allowComputes){
              requestJob();
            }
          },1000);
        });
    }
    // Automatically start computes - disabled to defer to checkbox
    // requestJob();
    if(allowComputes){
      requestJob();
    }

    $('#isComputesSelected').change(function() {
        if($(this).is(":checked")) {
          console.log("user started computes");
          allowComputes = true;
          socket.connect();
          createCookie('computes', allowComputes, 7);
          requestJob();
        } else {
          console.log("user stopped computes");
          allowComputes = false;
          socket.disconnect();
          eraseCookie('computes');
        }
    });

}
