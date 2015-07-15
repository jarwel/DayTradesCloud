Parse.Cloud.job("processPicks", function(request, status) {
  Parse.Cloud.useMasterKey();
   var host = "http://query.yahooapis.com/v1/public/yql?q=QUERY&env=store://datatables.org/alltableswithkeys&format=json";
   var yql = "select%20*%20from%20yahoo.finance.historicaldata%20where%20symbol%20=%20'SYMBOL'%20and%20startDate%20=%20'DATE'%20and%20endDate%20=%20'DATE'&env=store://datatables.org/alltableswithkeys&format=json";
   
  var date;
  if (request.params.date != null) {
    date = new Date(request.params.date);
    console.log("Running job for specified date: " + date);
  }
  else {
    date = new Date();
    date.setTime(date.getTime() - (24*60*60*1000));
    console.log("Running job on scheduled date: " + date);
  }
  var year = date.getFullYear();
  var month = ("0" + (date.getMonth() + 1)).slice(-2);
  var day = ("0" + date.getDate()).slice(-2);  
  var dateFormat = year + "-" + month + "-" + day;
   
  var query = new Parse.Query("Pick");
  query.include("account");
  query.notEqualTo("processed", true);
  query.equalTo("dayOfTrade", dateFormat);
  query.each(function(pick) {
    var symbol = pick.get("symbol");
    var target = host.replace("QUERY", yql.replace(/SYMBOL/g, symbol).replace(/DATE/g, dateFormat));
    console.log(target);
     
    var promise = Parse.Promise.as();
    promise = promise.then(function() { 
      return Parse.Cloud.httpRequest({ url: target }).then(function(httpResponse) {
        console.log(httpResponse.text);
        
        var object = JSON.parse(httpResponse.text);
        var open = parseFloat(object.query.results.quote.Open);
        var close = parseFloat(object.query.results.quote.Close);
 
        if (open == null || close == null) {
          console.error("Received an invalid response from yql");
          return Parse.Promise.error();
        }    
        
        var account = pick.get("account");
        var value = account.get("value");
        var shares = value / open;
        var change = Math.floor((Math.floor(close * 100) - Math.floor(open * 100)) * shares) / 100;          
           
        var account = pick.get("account");
        account.set("value", (Math.floor(value * 100) + Math.floor(change * 100)) / 100);
        if (change < 0) {
          account.increment("losers", 1);
        }
        else {
          account.increment("winners", 1);
        }
        account.save();
  
        pick.set("open", open);
        pick.set("close", close);
        pick.set("value", value);
        pick.set("change", change);
        pick.set("processed", true);  
        pick.save();    
        
        return Parse.Promise.as();
        
      }, 
      function(error) {
        console.error("Request failed with response code " + httpResponse.status);          
      });
    });
    return promise;
       
  }).then(function() {
    status.success("Job execution completed");
  }, function(error) {
    status.error("Job execution failed");
  });
});



Parse.Cloud.beforeSave("Security", function(request, response) {
  if (!request.object.isNew()) {
    response.success();
  }
  var symbol = request.object.get("symbol");
  var query = new Parse.Query("Security");
  query.equalTo("symbol", symbol);
  query.first().then(function(object) {
    if (object) { 
      response.error("A security already exists with symbol " + symbol);
    }
    else {
      request.object.set("picks", 0);
      response.success();
    }
  }, function(error) {
    response.error("Could not validate uniqueness of security");
  });
});


Parse.Cloud.beforeSave("Pick", function(request, response) {
  var symbol = request.object.get("symbol");
  var Security = Parse.Object.extend("Security");
  var security = new Security();
  security.set("symbol", symbol);
  security.save();
  response.success();
});
