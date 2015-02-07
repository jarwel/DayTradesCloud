Parse.Cloud.job("updatePicks", function(request, status) {
  Parse.Cloud.useMasterKey();

  var now = new Date();
  var offset = (24*60*60*1000);
  now.setTime(now.getTime() - offset);
  var day = ("0" + now.getDate()).slice(-2);
  var month = ("0" + (now.getMonth() + 1)).slice(-2);
  var date = now.getFullYear() + "-" + (month) + "-" + (day);

  var picks = new Parse.Query("Pick");
  picks.equalTo("tradeDate", date);
  picks.each(function(pick) {
    var host = "http://query.yahooapis.com/v1/public/yql?q=QUERY&env=store://datatables.org/alltableswithkeys&format=json";
    var query = "select%20*%20from%20yahoo.finance.historicaldata%20where%20symbol%20=%20'SYMBOL'%20and%20startDate%20=%20'DATE'%20and%20endDate%20=%20'DATE'&env=store://datatables.org/alltableswithkeys&format=json";
    var symbol = pick.get("symbol");
    var tradeDate = pick.get("tradeDate");
    var target = host.replace("QUERY", query.replace(/SYMBOL/g, symbol).replace(/DATE/g, tradeDate));
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
          var value = pick.get("value");
          var shares = Math.floor(value / open);
          var change = (close * 100 - open * 100) * shares / 100;
          pick.set("open", open);
          pick.set("close", close);
          pick.set("shares", shares);
          pick.set("change", change);
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
