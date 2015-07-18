
function scatterPlot () {
	/*
		this only works as a singleton class at the moment because
			of the config object. not really a problem right now
			since we don't need multiple scatterplots

		TO DO
		- modify so it takes in an existing SVG element so we can
			overlay things and have them zoom/pan in synchrony
	*/

	if (!scatterPlot.id) {
		scatterPlot.id = 0;
	}

	var config = {
		x: null,
		y: null,
		r: null,
		width: null,
		height: null,
		zoomRange: null,
		semanticZoom: null,
		dimension: null,
		group: null,
		points: null,
		coordinates: null
	};


	// real locals, not configs
	var id = scatterPlot.id++;
	var circle = null;

	function chart (div) {
		div.each(function () {
			var div = d3.select(this),
					g = div.select('g')

			if (g.empty()) {
				g = div.append('svg')
					.attr('width', config.width)
					.attr('height', config.height)
					.append('g')
					.call(d3.behavior.zoom()
						.x(config.x)
						.y(config.y)
						.scaleExtent(config.zoomRange)
						.on('zoom', zoom));
				g.append('rect')
					.attr('class', 'overlay')
					.attr('width', config.width)
					.attr('height', config.height);

				circle = g.selectAll('circle')
					.data(config.points)
					.enter().append('circle');	
			}

			circle
				.attr('r', function () { return Math.random() * 2 + 1; })
				.attr('transform', transform);
		});

		function zoom () {
			circle.attr('transform', transform);
		}

		function transform (d) {
			var coords = config.coordinates(d);
			var scaling = d3.event ? config.semanticZoom(d3.event.scale) : config.zoomRange[0];
			return 'translate(' + config.x(coords[0]) + ',' + config.y(coords[1]) + ')scale(' + scaling + ')';
		}
	}

	chart.rerender = function () {
		// in many cases the graph may be initialized before the data gets in,
		// so we need to check if it's here before doing anything
		var hash = {};
		if (config.group) {
			hash = config.group.all().reduce(function (o, g) {
				o[g.key] = g.value;
				return o;
			}, {});
		}

		circle.attr('r', function (d) {
			return config.r((hash[d.id] || 0) + 1);
		});
	};

	// dry as hell
	var configSetter = function (attrName) {
		return function (_) {
			if (!arguments.length) {
				return config[attrName];
			}
			config[attrName] = _;
			return chart;
		};
	}

	for (var conf in config) {
		chart[conf] = configSetter(conf);
	}

	return chart;
}


function barChart () {
	/*
		TO DO:
		- separate initalization from data input so the page isn't just
			empty while we're waiting for the data
	*/

	if (!barChart.id) {
		barChart.id = 0;
	}

	var margin = {top: 10, right: 10, bottom: 20, left: 10},
			x,
			y = d3.scale.linear().range([100, 0]),
			id = barChart.id++,
			axis = d3.svg.axis().orient('bottom'),
			brush = d3.svg.brush(),
			brushDirty,
			dimension,
			group,
			round,
			barWidth = 9;

	function chart (div) {
		var width = x.range()[1],
				height = y.range()[0];

		y.domain([0, group.top(1)[0].value]);

		div.each(function () {
			var div = d3.select(this),
					g = div.select('g');

			// initialize the chart if need be
			if (g.empty()) {
				// the best way to do the reset thing is to
				// angular $compile it and do ng-click,
				// but let's not worry about that now
				g = div.append('svg')
					.attr('width', width + margin.left + margin.right)
					.attr('height', height + margin.top + margin.bottom)
					.append('g')
					.attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

				g.append('clipPath')
					.attr('id', 'clip-' + id)
					.append('rect')
					.attr('width', width)
					.attr('height', height);

				// hacky
				g.selectAll('.bar')
					.data(['background', 'foreground'])
					.enter().append('path')
					.attr('class', function (d) { return d + ' bar'; })
					.datum(group.all());

				g.selectAll('.foreground.bar')
					.attr('clip-path', 'url(#clip-' + id + ')');

				g.append('g')
					.attr('class', 'axis')
					.attr('transform', 'translate(0,' + height + ')')
					.call(axis);

				var gBrush = g.append('g')
					.attr('class', 'brush')
					.call(brush);
				gBrush.selectAll('rect').attr('height', height);
			}

			// for redrawing the brush externally, that is,
			// not from the UI
			if (brushDirty) {
				brushDirty = false;
				g.selectAll('.brush').call(brush);
				if (brush.empty()) {
					g.selectAll('#clip-' + id + ' rect')
						.attr('x', 0)
						.attr('width', width);
				} else {
					var extent = brush.extent();
					g.selectAll('#clip-' + id + ' rect')
						.attr('x', x(extent[0]))
						.attr('width', x(extent[1]) - x(extent[0]));
				}
			}

			g.selectAll('.bar').attr('d', barPath);
		});

		// hacky and bad; doesn't create bar objects, just one huge bar,
		// and makes a long path. kinda bad actually
		function barPath (groups) {
			var path = [];
			for (var i = 0; i < groups.length; i++) {
				var d = groups[i];
				// this draws the bars based on the group
				// must return an appropriate key and value

				// the 9 part controls the width of the bars
				path.push('M', x(d.key), ',', height, 'V', y(d.value), 'h' + barWidth + 'V', height);
			}
			return path.join('');
		}
	}

	brush.on('brushstart.chart', function () {
		var div = d3.select(this.parentNode.parentNode.parentNode);
	});

	brush.on('brush.chart', function () {
		var g = d3.select(this.parentNode),
				extent = brush.extent();
		if (round) {
			extent = extent.map(round);
			g.select('.brush')
				.call(brush.extent(extent));
		}
		g.select('#clip-' + id + ' rect')
			.attr('x', x(extent[0]))
			.attr('width', x(extent[1]) - x(extent[0]));

		// the real meat
		dimension.filterRange(extent);
	});

	brush.on('brushend.chart', function () {
		if (brush.empty()) {
			var div = d3.select(this.parentNode.parentNode.parentNode);
			div.select('#clip-' + id + ' rect').attr('x', null).attr('width', '100%');
			dimension.filterAll();
		}
	});

	// the dry approach doesn't work here because it ends up creating config
	// as a class variable rather than an instance variable; not enough time
	// to fix it right now

	chart.margin = function (_) {
		if (!arguments.length) {
			return margin;
		}
		margin = _;
		return chart;
	};

	chart.x = function (_) {
		if (!arguments.length) {
			return x;
		}
		x = _;
		axis.scale(x);
		brush.x(x);
		return chart;
	};

	chart.y = function (_) {
		if (!arguments.length) {
			return y;
		}
		y = _;
		return chart; 
	};

	chart.dimension = function (_) {
		if (!arguments.length) {
			return dimension;
		}
		dimension = _;
		return chart;
	};

	chart.filter = function (_) {
		if (_) {
			brush.extent(_);
			dimension.filterRange(_);
		} else {
			brush.clear();
			dimension.filterAll();
		}
		brushDirty = true;
		return chart;
	};

	chart.group = function (_) {
		if (!arguments.length) {
			return group;
		}
		group = _;
		return chart;
	};

	chart.round = function (_) {
		if (!arguments.length) {
			return round;
		}
		round = _;
		return chart;
	};

	chart.tickFormat = function (tf) {
		axis.tickFormat(tf);
		return chart;
	};

	chart.barWidth = function (_) {
		if (!arguments.length) {
			return barWidth;
		}
		barWidth = _;
		return chart;
	};

	return d3.rebind(chart, brush, 'on');
}
