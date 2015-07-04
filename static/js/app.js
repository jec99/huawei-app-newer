
var mapApp = angular.module('mapApp', ['leaflet-directive', 'ngMaterial']);

mapApp.factory('stationData', function ($q, $http) {
	var geoJSON;
	return {
		get: function () {
			var deferred = $q.defer();
			if (!geoJSON) {
				$http.get('/station_data'
				).success(function (data, status, headers, response) {
					geoJSON = data;
					deferred.resolve(data);
				}).error(function (data, status, headers, response) {
					deferred.reject(status);
				});
			} else {
				deferred.resolve(geoJSON);
			}

			return deferred.promise;
		}
	};
});

mapApp.factory('bikeDirections', function ($q, $http) {
	return {
		get: function (x, y) {
			// takes in station id x, station id y
			var deferred = $q.defer();
			$http.get('/bike_station_route/' + x + '/' + y
			).success(function (data, status, headers, response) {
				deferred.resolve(data);
			}).error(function (data, status, headers, response) {
				deferred.reject(status);
			});

			return deferred.promise;
		}
	}
});

mapApp.controller('MainController', function ($scope, stationData, bikeDirections, leafletEvents) {

	var x_station = [-76.998347, 38.899972];
	var y_station = [-77.0512, 38.8561];

	$scope.stations = {};
	stationData.get().then(function (data) {
		// adding a bunch of markers for the stations, as opposed to geojson
		var feature;
		for (var i = 0; i < data.features.length; i++) {
			feature = data.features[i];
			$scope.stations[feature.id] = {
				lng: feature.geometry.coordinates[0],
				lat: feature.geometry.coordinates[1],
				properties: feature.properties,
				id: feature.id,
				focus: false,
				resetStyleOnMouseout: true,
				// message: 'hi this is a popup',
					// message can be text or an angular template
				// popupAnchor:  [0, 0],
				// popupOptions: {
				// 	className: 'popup'
				// },
				icon: {
					type: 'div',
					className: 'marker-default',
					iconSize: null,
					html: '<div class="icon-container">B</div>'
				}
			}
		}

		return data;
	}).then(function (data) {
		// this is just a sample, obviously
		var x_station = data.features[0].id;
		var y_station = data.features[1].id;
		bikeDirections.get(x_station, y_station).then(function (data) {
			$scope.directions = data;
			console.log(data);
		});
	});
	

	angular.extend($scope, {
		tiles: {
			name: 'local',
			url: 'http://127.0.0.1:8080/simple/{z}/{x}/{y}.png',
			type: 'xyz',
			options: {
				attribution: ''
			}
		},
		layers: {
			baselayers: {
				simple: {
					name: "Simple",
					url: 'http://127.0.0.1:8080/simple/{z}/{x}/{y}.png',
					type: 'xyz'
				},
				muted: {
					name: "Muted",
					url: 'http://127.0.0.1:8080/muted/{z}/{x}/{y}.png',
					type: 'xyz'
				}
			}
		},
		maxbounds: {
			northEast: {
				lat: 39.6268,
				lng: -76.0597
			},
			southWest: {
				lat: 38.5439,
				lng: -77.5896
			}
		},
		dc: {
			lat: 38.888928,
			lng: -77.034136,
			zoom: 12
		},
		defaults: {
			maxZoom: 16,
			minZoom: 10
		}
	});

	$scope.$on('leafletDirectiveGeoJson.click', function (ev, payload) {
		console.log(payload.model.properties.name);
	});

	$scope.$on('leafletDirectiveMarker.click', function (ev, payload) {
		console.log('clicked: ' + payload.model.properties.name);
	});

	$scope.$on('leafletDirectiveMap.zoomend', function (ev, payload) {
		console.log('zoom level: ' + payload.leafletObject._zoom);
	});

	$scope.$on('leafletDirectiveMap.baselayerchange', function (ev, payload) {
		console.log('new layer: ' + payload.leafletEvent.name);
	})
});

mapApp.controller('GraphController', function ($scope, stationData) {
	/*
		THIS CODE IS ALL TERRIBLE AND SHOULD
		BE MIGRATED TO A DIRECTIVE AS SOON AS
		POSSIBLE, I FEEL LIKE I'M USING JQUERY
		OR SOME SHIT
	*/

	var currentSizing = "nothing";
	var currentEdge = "fixed";
	var pathSource = "";

	var width = 500, height = 600;

	var fill = d3.scale.category20();

	var nodes;
	var links;
	var node;
	var link;
	var force;

	var restart = function () {
		link = link.data(links);
		node = node.data(nodes);
		var nodeg = node.enter().insert("g")
			.attr("class", "node")
			.call(force.drag);

		nodeg.append("circle")
			.attr("r", 5)
			.attr("class", "node")
			// .style("stroke-width", 0)
			.style("stroke", "#808080");
					
		node.exit().transition().duration(300).attr("r", 1).remove();

		link.enter().insert("line", ".node").attr("class", "link");
		link.exit().remove();
		force.start();
	};

	var plotLayout = function () {
		force.stop();
		minX = d3.min(nodes, function(d) { return parseFloat(d["lng"]); });
		maxX = d3.max(nodes, function(d) { return parseFloat(d["lng"]); });
		minY = d3.min(nodes, function(d) { return parseFloat(d["lat"]); });
		maxY = d3.max(nodes, function(d) { return parseFloat(d["lat"]); });

		heightRamp = d3.scale.linear().domain([minY, maxY]).range([550,50]).clamp(true);
		widthRamp = d3.scale.linear().domain([minX, maxX]).range([50,450]).clamp(true);

		for (x in nodes) {
			nodes[x].x = widthRamp(parseFloat(nodes[x].lng));
			nodes[x].px = widthRamp(parseFloat(nodes[x].lng));
			nodes[x].y = heightRamp(parseFloat(nodes[x].lat));
			nodes[x].py = heightRamp(parseFloat(nodes[x].lat));
		}
		
		link.attr("x1", function (d) { return widthRamp(d.source.lng); })
			.attr("y1", function (d) { return heightRamp(d.source.lat); })
			.attr("x2", function (d) { return widthRamp(d.target.lng); })
			.attr("y2", function (d) { return heightRamp(d.target.lat); });
	};

	var randomGraph = function (n, p) {
		// erdos-renyi
		var graph = {nodes: [], links: []};
		for (var i = 0; i < n; i++) {
			var lat = Math.random();
			var lng = Math.random();
			var size = Math.random()
			var newNode = {id: i, lat: lat, lng: lng, size: size};
			graph.nodes.push(newNode);
			for (var j = 0; j < n; j++) {
				if (i < j && Math.random() < p) {
					var weight = Math.random();
					newLink = {source: i, target: j, weight: weight};
					graph.links.push(newLink);
				}
			}
		}
		
		d3.select("#network-viz-1 #background").remove();
		initializeGraph(graph);
	};

	var initializeGraph = function (graph) {
		var newNodes = [];
		var newLinks = [];
		var nodeHash = {};
		for (var i = 0; i < graph.nodes.length; i++) {
			newNodes.push(graph.nodes[i]);
			nodeHash[String(graph.nodes[i].id)] = i;
		}
		for (var i = 0; i < graph.links.length; i++) {
			newLinks.push({
				id: i,
				source: graph.nodes[nodeHash[graph.links[i].source]],
				target: graph.nodes[nodeHash[graph.links[i].target]],
				weight: graph.links[i].weight
			});
		}

		var minWeight = d3.min(newLinks, function (d) {return parseFloat(d["weight"])});
		var maxWeight = d3.max(newLinks, function (d) {return parseFloat(d["weight"])});
		var edgeRamp = d3.scale.linear().domain([minWeight, maxWeight]).range([.5,3]).clamp(true);

		force = d3.layout.force()
			.size([width, height])
			.nodes(newNodes)
			.links(newLinks)
			.linkDistance(function(d) {return (edgeRamp(parseFloat(d["weight"])) * 30)})
			.charge(-60)
			.on("tick", tick);

		var svg = d3.select('#network-viz-1');
		
		svg.append("rect")
			.attr("width", width)
			.attr("height", height)
			.attr("id","background");

		nodes = force.nodes();
		links = force.links();
		node = svg.selectAll(".node");
		link = svg.selectAll(".link");

		var minSize = d3.min(nodes, function (d) { return parseFloat(d["size"]); });
		var maxSize = d3.max(nodes, function (d) { return parseFloat(d["size"]); });
		var minWeight = d3.min(links, function (d) { return parseFloat(d["weight"]); });
		var maxWeight = d3.max(links, function (d) { return parseFloat(d["weight"]); });

		var sizingRamp = d3.scale.linear().domain([minSize, maxSize]).range([1, 10]).clamp(true);
		var edgeRamp = d3.scale.linear().domain([maxWeight, minWeight]).range([.5, 3]).clamp(true);
		
		restart();
		d3.selectAll("circle.node").attr("r", function(d) { return sizingRamp(d["size"]); });
		d3.selectAll("line.link").style("stroke-width", function(d) { return edgeRamp(d["weight"]); });
	};

	var tick = function () {
		link.attr("x1", function (d) { return widthRamp(d.source.lng); })
			.attr("y1", function (d) { return widthRamp(d.source.lat); })
			.attr("x2", function (d) { return widthRamp(d.target.lng); })
			.attr("y2", function (d) { return widthRamp(d.target.lat); });
		node.attr("transform", function (d) {return "translate(" + d.lng + "," + d.lat + ")"});
	};

	// stationData.get().then(function (data) {
	// });

	randomGraph(50,.025);
	plotLayout();
});


mapApp.controller('GraphControllerTwo', function ($scope) {
	var width = 600,
			height = 500;
	var svg = d3.select('#network-viz-1')
		.attr('width', width)
		.attr('height', height);

	function layoutGraph (g) {
		// no edges for now

		var weight_f = function (d) { return d.weight; };
		var size_f = function (d) { return d.size; };
		var minWeight = d3.min(g.edges, weight_f);
		var maxWeight = d3.max(g.edges, weight_f);
		var edgeRamp = d3.scale.linear().domain([minWeight, maxWeight]).range([.5,4]).clamp(true);
		var minSize = d3.min(g.nodes, size_f);
		var maxSize = d3.max(g.nodes, size_f);
		var sizingRamp = d3.scale.linear().domain([minSize, maxSize]).range([1, 10]).clamp(true);

		var minX = d3.min(g.nodes, function (d) { return d.lng; });
		var maxX = d3.max(g.nodes, function (d) { return d.lng; });
		var minY = d3.min(g.nodes, function (d) { return d.lat; });
		var maxY = d3.max(g.nodes, function (d) { return d.lat; });

		var heightRamp = d3.scale.linear().domain([minY, maxY]).range([550,50]).clamp(true);
		var widthRamp = d3.scale.linear().domain([minX, maxX]).range([50,450]).clamp(true);

		svg.selectAll(".line")
			.data(g.edges)
			.enter()
			.append("svg:line")
			.attr("x1", function (d) { return widthRamp(d.source.lng); })
			.attr("y1", function (d) { return heightRamp(d.source.lat); })
			.attr("x2", function (d) { return widthRamp(d.target.lng); })
			.attr("y2", function (d) { return heightRamp(d.target.lat); })
			.attr('class', 'edge')
			.style("stroke-width", function (d) { return edgeRamp(d.weight); });

		svg.selectAll('circle.node')
			.data(g.nodes)
			.enter()
			.append('svg:circle')
			.attr('cx', function (d) { return widthRamp(d.lng); })
			.attr('cy', function (d) { return heightRamp(d.lat); })
			.attr('r', function (d) { return sizingRamp(d.size); })
			.attr('class', 'node');
	};

	function randomGraph (n, p) {
		// erdos-renyi
		var graph = {nodes: [], edges: []};
		for (var i = 0; i < n; i++) {
			var lat = Math.random();
			var lng = Math.random();
			var size = Math.random()
			var newNode = {id: i, lat: lat, lng: lng, size: size};
			graph.nodes.push(newNode);
			for (var j = 0; j < n; j++) {
				if (j < i && Math.random() < p) {
					var weight = Math.random();
					newLink = {source: graph.nodes[i], target: graph.nodes[j], weight: weight};
					graph.edges.push(newLink);
				}
			}
		}
		return graph;
	};

	layoutGraph(randomGraph(10, 0.35));

});


