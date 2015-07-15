
angular.module('mapApp.dcControllers', [])

.controller('PhotosCrossfilterController', function ($scope, $timeout, photosFactory) {
	photosFactory.get('2012-06-01 00:00:00', '2012-07-01 00:00:00').then(function (data) {
		// for instant response times
		dc.constants.EVENT_DELAY = 35;

		var photos;
		var dateDimension;
		var dates;
		var hourDimension;
		var hours;
		var charts;

		data.data.forEach(function (e) {
			e.date = new Date(e.date);
		});
		photos = crossfilter(data.data);
		dateDimension = photos.dimension(function (e) { return e.date; });
		hourDimension = photos.dimension(function (e) { return e.date.getHours() + e.date.getMinutes() / 60; });
		dates = dateDimension.group(d3.time.day);
		hours = hourDimension.group(Math.floor);

		var firstDate = dateDimension.bottom(1)[0].date;
		var lastDate = dateDimension.top(1)[0].date;
		var daysDifference = (lastDate - firstDate) / 1000 / 60 / 60 / 24;

		// this is coming from dc.js, a crossfilter charting library
		// if it turns out it's not enough to connect to d3 as well
		// as we want, we can just reimplement the crossfilter
		// example (only bar charts but the rest can be ported)
		var hourChart = dc.barChart('#photo-hour-chart')
			.width(480)
			.height(150)
			.margins({top: 10, right: 10, bottom: 20, left: 40})
			.dimension(hourDimension)
			.group(hours.reduceCount())
			// alternatively hours.reduceSum(function (t) {return f(t); })
			.transitionDuration(100)
			.centerBar(true)
			.gap(0)
			.x(d3.scale.linear()
				.domain([0, 24]))
				// .rangeRound([0, 10 * 24]))  maybe if needed
			.elasticY(false)
			.xAxis().tickFormat(function (v) { return v; });

		var dateChart = dc.barChart('#photo-date-chart')
			.width(640)
			.height(150)
			.margins({top: 10, right: 10, bottom: 20, left: 40})
			.dimension(dateDimension)
			.group(dates.reduceCount())
			.transitionDuration(100)
			.centerBar(true)
			.gap(-18.5)
			.x(d3.time.scale()
				.domain([firstDate, lastDate]))
			.elasticY(false)
			.xAxis().tickFormat(function (v) { return v.getMonth() + '-' + v.getDate(); });

		dc.renderAll();

		/* ***************

		// AN INTERLUDE ON CROSSFILTER

		photos.groupAll().reduceSum(function (e) { return e.val; }).value();
		var dateDimension = photos.dimension(function (e) { return e.date; });
		dateDimension.filter('2012-02-01 00:00:00');
		// now all operations are run on the filtered data
		photos.groupAll().reduceCount().value();
		// to clear the filters
		dateDimension.filterAll();
		var countMeasure = dateDimension.group().reduceSum(function () { return 1; });
		var a = countMeasure.top(countMeasure.size());
		// equivalent to countMeasure.all();
		// countMeasure now is an array of {key:, value:} objects,
		// key being name of group, value returned by the measure
		// what about filtering on ranges instead of specific values?
		dateDimension.filter([date1, date2]);
		dateDimension.filter(function (e) { return e.date == date1; });
		// removing filters is important, they are very expensive, and it's
		// not practical to have more than 8
		dateDimension.dispose();

		photos.add(data);  // adds data
		photos.remove();  // removes all records matching the current filter
		
		*************** */
	});

})

.controller('RidesCrossfilterController', function ($scope, $q, stationsFactory, ridesFactory) {
	var t_start = '2012-06-01 00:00:00';
	var t_end = '2012-06-02 00:00:00';
	var center = [-77.034136, 38.888928];
	var bounds = [[-77.2, 38.8], [-76.8, 39.1]];

	// if (false)
	// zoom's not working so i'm going to roll it myself
	$q.all([
		stationsFactory.get(),
		ridesFactory.get(t_start, t_end)
	]).then(function (data) {
		// reformat station data
		var stations = {};
		for (var i = 0; i < data[0].data.length; i++) {
			stations[i] = {
				lng: data[0].data[i].lng,
				lat: data[0].data[i].lat
			};
		}

		var rides = crossfilter(data[1].data);
		var ridesStartStation = rides.dimension(function (e) { return e.start_id; });
		var ridesGroup = ridesStartStation.group();

		var stationChart = dc.bubbleChart('#station-bubble-chart')
			.width(640)
			.height(640)
			.margins({top: 10, right: 50, bottom: 30, left: 40})
			.dimension(ridesStartStation)
			.group(ridesGroup)
			.transitionDuration(100)
			.colorAccessor(function (e) {
				return 'blue';
			})
			.keyAccessor(function (e) {
				return stations[e.key].lng;
				// return bounds[0][0];
			})
			.valueAccessor(function (e) {
				// simplest possible projection
				return stations[e.key].lat * Math.cos(center[1]);
				// return bounds[0][1];
			})
			.radiusValueAccessor(function (e) {
				// return Math.random() * 5;
				// return Math.min(e.value, 1);
				return 0.01 * e.value;
				// return 12;
			})
			// .maxBubbleRelativeSize(0.3)
			.x(d3.scale.linear().domain([bounds[0][0], bounds[1][0]]))
			.y(d3.scale.linear().domain([bounds[0][1] * Math.cos(center[1]), bounds[1][1] * Math.cos(center[1])]))
			.r(d3.scale.linear().domain([0, 15]))

			.elasticX(false)
			.elasticY(false)
			.xAxisPadding(100)
			.yAxisPadding(100)
			.renderHorizontalGridLines(true)
			.renderVerticalGridLines(true)
			.renderLabel(false)
			.mouseZoomable(true);

			dc.renderAll();
	});

});
