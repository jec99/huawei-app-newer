
/*
ATTRIBUTION: this code is lightly adapted from Steven Hall's
	implementation to add a little more functionality. Credit
	for the original code goes to him.
*/

L.HexbinLayer = L.Class.extend({
	includes: L.Mixin.Events,
	initialize: function (data, options) {
		/*
		options = {
			clamp: true/false,
			scaling: 'sqrt'/'log'
		}
		*/
		this.levels = {};
		this.layout = d3.hexbin().radius(10);
		this.r_scale = d3.scale.sqrt().range([0, 10]).clamp(options.clamp);

		// maybe pass in a function for doing this too, taking counts and
		// returning a size
		// this.r_scale = options.scale;

		// if (options.scaling == 'sqrt') {
		// 	this.r_scale = d3.scale.sqrt().range([0, 10]).clamp(false);
		// } else if (options.scaling == 'log') {
		// 	this.r_scale = d3.scale.log().base(Math.E).range([0, 10]).clamp(false);
		// }
		this.raw_data = data;
		console.log(options);
		this.config = options;
	},
	project: function (pt) {
		// expects lng/lat, as usual
		var point = this.map.latLngToLayerPoint([pt[1], pt[0]]);
		return [point.x, point.y];
	},
	getBounds: function (data) {
		var bounds = d3.geo.bounds(data);
		return L.bounds(
			this.project([bounds[0][0], bounds[1][1]]),
			this.project([bounds[1][0], bounds[0][1]])
		);
	},
	update: function () {
		var padding = 100;
		var bounds = this.getBounds(this.raw_data);
		var zoom = this.map.getZoom();
		// see below for this.container; it's an svg element
		this.container
			.attr('width', bounds.getSize().x + 2 * padding)
			.attr('height', bounds.getSize().y + 2 * padding)
			.style("margin-left", (bounds.min.x - padding) + "px")
			.style("margin-top", (bounds.min.y - padding) + "px");
		// bounds.min is the top-left point of the bounds, conveniently
		if (!(zoom in this.levels)) {
			this.levels[zoom] = this.container.append('g')
				.attr('class', 'zoom-' + zoom);
			this.generateHexagons(this.levels[zoom]);
			this.levels[zoom]
				.attr('transform', 'translate(' + -(bounds.min.x - padding)
					+ ',' + -(bounds.min.y - padding) + ')');
		}
		if (this.current_level) {
			this.current_level.style('display', 'none');
		}
		this.current_level = this.levels[zoom];
		this.current_level.style('display', 'inline');
	},
	onAdd: function (map) {
		this.map = map;
		var overlayPane = this.map.getPanes().overlayPane;
		if (!this.container || overlayPane.empty) {
			this.container = d3.select(overlayPane)
				.append('svg')
				.attr('id', 'hexbin-container')
				.classed('leaflet-layer', true)
				.classed('leaflet-zoom-hide', true);
		}
		// maybe moveent
		map.on({ 'zoomend': this.update }, this);
		this.update();
	},
	addTo: function (map) {
		map.addLayer(this);
		return this;
	},
	generateHexagons: function (container) {
		var data = this.raw_data.features.map(function (e) {
			var coords = this.project(e.geometry.coordinates);
			return [coords[0], coords[1], e.properties];
		}, this);

		var bins = this.layout(data);
		var counts = [];
		bins.map(function (e) { counts.push(e.length); });
		// add in something to make this variable later
		this.r_scale.domain([0, ss.mean(counts) + ss.standard_deviation(counts) * 10]);

		var hexagons = container.selectAll('.hexagon').data(bins);
		var path = hexagons.enter()
			.append('path')
			.attr('class', 'hexagon');
		this.config.style.call(this, path);

		// try
		// style('fill', this.config.style.fill(this));
		// etc.

		var layer_this = this;
		hexagons.attr('d', function (e) {
			return layer_this.layout.hexagon(layer_this.r_scale(e.length));
		}).attr('transform', function (e) {
			return 'translate(' + e.x + ',' + e.y + ')';
		}).on('mouseover', layer_this.config.mouseover.call(this))
		.on('mouseout', layer_this.config.mouseout.call(this));
	}
});

L.hexbinLayer = function (data, options) {
	return new L.HexbinLayer(data, options);
};


