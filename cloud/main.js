Parse.Cloud.job("updatePicks", function(request, status) {
  Parse.Cloud.useMasterKey();

  var hostFormat = "http://query.yahooapis.com/v1/public/yql?q=QUERY&env=store://datatables.org/alltableswithkeys&format=json";
  var queryFormat = "select%20*%20from%20yahoo.finance.historicaldata%20where%20symbol%20=%20'SYMBOL'%20and%20startDate%20=%20'DATE'%20and%20endDate%20=%20'DATE'&env=store://datatables.org/alltableswithkeys&format=json";

  var date = new Date();
  var offset = (24*60*60*1000);
  date.setTime(date.getTime() - offset);
  date.setHours(14);
  date.setMinutes(30);
  date.setSeconds(0);
  date.setMilliseconds(0);
  console.log(date);

  var year = date.getFullYear();
  var month = ("0" + (date.getMonth() + 1)).slice(-2);
  var day = ("0" + date.getDate()).slice(-2);  
  var dateFormat = year + "-" + month + "-" + day;

  var query = new Parse.Query("Pick");
  query.include("account");
  query.notEqualTo("processed", true);
  query.equalTo("tradeDate", date);
  query.each(function(pick) {
    var symbol = pick.get("symbol");
    var target = hostFormat.replace("QUERY", queryFormat.replace(/SYMBOL/g, symbol).replace(/DATE/g, dateFormat));
    console.log(target);
   
    var promise = Parse.Promise.as();
    promise = promise.then(function() { 
      return Parse.Cloud.httpRequest({
        url: target,
        success: function(httpResponse) {
          console.log(httpResponse.text);

          var object = JSON.parse(httpResponse.text);
          var open = parseFloat(object.query.results.quote.Open);
          var close = parseFloat(object.query.results.quote.Close);
          
          var account = pick.get("account");
          var value = account.get("value");
          var winners = parseInt(account.get("winners"));
          var losers = parseInt(account.get("losers"));

          var shares = value / open;
          var change = (Math.floor(close * 100) - Math.floor(open * 100)) * shares / 100;          
          
          var account = pick.get("account");
          account.set("value", (Math.floor(value * 100) + Math.floor(change * 100)) / 100);
          if (change < 0) {
            account.set("losers", losers + 1);
	  }
          else {
            account.set("winners", winners + 1);
          }
          account.save();
 
          pick.set("open", open);
          pick.set("close", close);
          pick.set("value", value);
          pick.set("change", change);
          pick.set("processed", true);
          return pick.save();
        },
        error: function(httpResponse) {
          console.error('Request failed with response code ' + httpResponse.status);
        }
      });
    });
    return promise;
  }).then(function() {
    // Set the job's success status
    status.success("Picks updated successfully.");
  }, function(error) {
    // Set the job's error status
    status.error("Uh oh, something went wrong.");
  });
});
