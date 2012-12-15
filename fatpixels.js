(function(window, document, undefined){
	
	/*
	 * Fills in default values.
     */
    
    function merge(obj) {
	    for (var i=1; i < arguments.length; i++) {
		    var def = arguments[i]
		    for (var n in def)
		    	if (obj[n] === undefined) obj[n] = def[n]
		    }
		    return obj
	}
	
	/*
	 * Checks if a string has a suffix.
	 */
	function suffix(str, suffix) {
		return str.indexOf(suffix, str.length - suffix.length) !== -1;
	}
	
	/*
	 * Gets an image from an URL.
     */
    
    function get(URL, onCompletion) {
	    var img = new Image();
	    if (onCompletion)
	    {
		    img.onload = function() {
			    onCompletion(img, URL);
		    };
		    img.onerror = function() {
			    onCompletion(false);
		    };
		    img.onabort = function() {
			    onCompletion(false);
		    };
	    }
	    img.src = URL;
    }
    
    /*
     * requestAnimationFrame() by Paul Irish.
     */
	var requestAnimFrame = (function() {
		return  window.requestAnimationFrame       || 
				window.webkitRequestAnimationFrame || 
				window.mozRequestAnimationFrame    || 
				window.oRequestAnimationFrame      || 
				window.msRequestAnimationFrame     || 
				function(/* function */ callback, /* DOMElement */ element){
					window.setTimeout(callback, 1000 / 60);
				};
	})();
	
    /*
	 * Freaking setInterval having a baby with requestAnimationFrame().
	 */
	function requestInterval(fn, delay) {
		if( !window.requestAnimationFrame       && 
			!window.webkitRequestAnimationFrame && 
			!(window.mozRequestAnimationFrame && window.mozCancelRequestAnimationFrame) &&
			!window.oRequestAnimationFrame      && 
			!window.msRequestAnimationFrame)
				return window.setInterval(fn, delay);
				
		var start = new Date().getTime(),
			handle = new Object();
			
		function loop() {
			var current = new Date().getTime(),
				delta = current - start;
				
			if(delta >= delay) {
				fn.call();
				start = new Date().getTime();
			}
	 
			handle.value = requestAnimFrame(loop);
		};
		
		handle.value = requestAnimFrame(loop);
		return handle;
	}
	 
	/*
	 * clearInterval() for a requestInterval().
	 */
	function clearRequestInterval(handle) {
	    window.cancelAnimationFrame ? window.cancelAnimationFrame(handle.value) :
	    window.webkitCancelAnimationFrame ? window.webkitCancelAnimationFrame(handle.value) :
	    window.webkitCancelRequestAnimationFrame ? window.webkitCancelRequestAnimationFrame(handle.value) : 
	    window.mozCancelRequestAnimationFrame ? window.mozCancelRequestAnimationFrame(handle.value) :
	    window.oCancelRequestAnimationFrame	? window.oCancelRequestAnimationFrame(handle.value) :
	    window.msCancelRequestAnimationFrame ? window.msCancelRequestAnimationFrame(handle.value) :
	    clearInterval(handle);
	};
    
	/*
	 *
	 * The default options.
	 *
	 */
	
	var defaults = {
		scale    : 1.0,      // (Float) Scaling factor for rendering a pixel.
		autoplay : true,	 // (BOOL) Should start playing immediately.
		loop     : true,	 // (BOOL) Repeats over and over or just once after -play.
		speed    : "15fps",  // (String or Float) - Strings like "69fps", "200ms" or "1s".
							 //            		 - Floats will work as milliseconds.
	};
	
	/*
	 *
	 * FatPixels Constructor.
	 *
	 */
	var FatPixels = function(o) {
		if (!this.drawWithTarget) return new FatPixels(o)
		this.options = merge(o || {}, {}, defaults);
		
		//
		// Kind of private properties:
		//
		
		// (Array) User-provided bitmaps.
		this.bitmaps = null;
		
		// (Size) The size of the bitmaps.
		this.bitmapSize = {width : 0, height : 0};
		
		// (Array) An array of FatFrame objects for each frame.
		this.frames = null;
		
		// (Integer) The initial frame to start animating.
		this.frame = 0;
		
		// (BOOL) Uses the sprite mode.
		this.useSprite = this.options.sprite != undefined;
		
		// (BOOL) Uses the old image array mode.
		this.useArrayOfImages = this.options.images != undefined;
	};
	
	/*
	 *
	 * Frame Constructor. For the super weird case of drawing and caching
	 *					  custom frames. Used internally, ignore it.
	 *	Parameters:
	 		- w, h. (Floats) Width and height for the frame buffer.
	 *
	 */
	var FatFrame = function(w, h) {
		// Why have a stored canvas for each frame? Because it's super fast
		// to draw from canvas to canvas. Waaaay faster than drawing images.
		this.buffer = document.createElement("canvas");
		this.buffer.width = w;
		this.buffer.height = h;
	};
	
	FatFrame.prototype.drawInBuffer = function(canvas){
		this.buffer.getContext("2d").drawImage(canvas, 0, 0); // Canvas to buffer.
	};
	
	FatFrame.prototype.drawBufferInContext = function(context){
		context.drawImage(this.buffer, 0, 0); // Buffer to canvas 2D context.
	};
	
	/*
	 *
	 * - renderFrames. Renders each frame.
	 *	Parameters:
	 		- onCompletion. (Function) A function called after frames are ready.
	 		- ignoreCache. (BOOL) Pass true to force bitmap downloading.
	 *
	 */
	
	FatPixels.prototype.renderFrames = function(onCompletion, ignoreCache) {
		
		// Bitmaps are the user provided images at original scale (1x).
		// If not present, they get downloaded.
		var bitmaps = this.bitmaps;
		var bitmapSize = this.bitmapSize;
		
		if (!bitmaps || ignoreCache)
		{
			var _this = this;
			
			return _this.getBitmaps(function(_bitmaps, _bitmapSize){
				_this.bitmaps = _bitmaps;
				_this.bitmapSize = _bitmapSize;
				_this.renderFrames(onCompletion, false); // If cache already ignored, keep going.
			});
		}
		
		// Frames are FatPixels scaled versions of the user bitmaps.
		// They're drawn once (or when the scale changes), and used
		// directly by the animation functions.
		var frames = [];
		
		var scale = this.options.scale,
		 		w = bitmapSize.width * scale,
		 		h = bitmapSize.height * scale;
		
		var canvas = document.createElement("canvas");
		canvas.width = w;
		canvas.height = h;
		
		var ctx = canvas.getContext("2d");
		
		for (var i=0; i<bitmaps.length; i++)
		{
			// Each bitmap is an ImageData object.
			// We loop an CanvasPixelArray object that contains
			// 4 components (r, g, b, a) for each pixel.
			
			var data = bitmaps[i].data;
			var dataLength = data.length;
			
			// Clear and draw.
			ctx.clearRect(0, 0, w , h);
			
			for (var x = 0; x < bitmapSize.width; x++) for (var y = 0; y < bitmapSize.height; y++)
			{
				var index = (x + y * bitmapSize.width) * 4;
				var r, g, b, a;
				
				r = data[index+0];
				g = data[index+1];
				b = data[index+2];
				a = data[index+3];
				
				ctx.fillStyle = "rgba("+r+","+g+","+b+","+a+")";
				ctx.fillRect(x * scale, y * scale, scale, scale);
			}
			
			var frame = new FatFrame(w, h);
				frame.drawInBuffer(canvas);
			
			frames[i] = frame;
		}
		
		this.frames = frames;
		
		if (onCompletion) onCompletion();
	};
	
	/*
	 *
	 * - getBitmaps. Access the tubes of the Internet for the user-provided images.
	 *	Parameters:
	 		- onCompletion. (Function) A function called after frames are downloaded.
	 *
	 */
	
	FatPixels.prototype.getBitmaps = function(onCompletion) {
	
		var bitmaps = [];
		var bitmapSize = [0, 0];
		
		// Sprite.
		if (this.useSprite)
		{
			var sprite = this.options.sprite;
			
			var	URL = sprite.url,
				direction = sprite.direction,
				count = sprite.count;
			
			get(URL, function(image){
				if (image)
				{
					// Draw the sprite.
					var w = image.width,
						h = image.height;
				
					var canvas = document.createElement("canvas");
					canvas.width = w;
					canvas.height = h;
					
					var ctx = canvas.getContext("2d");
						ctx.drawImage(image, 0, 0, w, h);
					
					// Crop it to pieces.
					var sw, sh, dx = 0, dy = 0;
					
					if (direction === "x")
					{
						sw = image.width / count;
						sh = image.height;
						
						dx = sw;
					}
					else
					{
						sw = image.width;
						sh = image.height / count;
						
						dy = sh;
					}
					
					bitmapSize = {width : sw, height : sh};
					
					for (var i=0; i<count; i++)
					{
						bitmaps[i] = ctx.getImageData(dx*i, dy*i, sw, sh);
					}	
				}
				
				if (onCompletion) onCompletion(bitmaps, bitmapSize);
			});
		}
		
		// Array of URLs.
		else if (this.useArrayOfImages)
		{
			var images = this.options.images;
			var pending = images.length;
			
			for (var i=0; i<images.length; i++) get(images[i], function(image, URL){
				pending--;
				
				if (image)
				{
					var w = image.width;
						h = image.height;
						
					bitmapSize = {width : w, height : h};
						
					var canvas = document.createElement("canvas");
					canvas.width = w;
					canvas.height = h;
					
					var ctx = canvas.getContext("2d");
						ctx.drawImage(image, 0, 0, w, h);
					
					bitmaps[images.indexOf(URL)] = ctx.getImageData(0, 0, w, h);
				}
				
				if (pending == 0 && onCompletion) onCompletion(bitmaps, bitmapSize);
			});
		}
	};
	
	/*
	 *
	 * - drawWithTarget: Draws inside any element. A <canvas> will be put inside.
	 *	Parameters:
	 		- target. (DOMElement) Easy as any DOM element.
	 *
	 */
	 
	FatPixels.prototype.drawWithTarget = function(target) {
		var canvas = document.createElement("canvas");
		
		target.appendChild(canvas);
		
		this.drawWithCanvas(canvas);
	};
	
	/*
	 *
	 * - drawWithCanvas: Draws directly to a <canvas> element.
	 *	Parameters:
	 		- canvas. (DOMElement) A <canvas> DOM element.
	 *
	 */
	 
	FatPixels.prototype.drawWithCanvas = function(canvas) {
		var ctx = canvas.getContext("2d");
		var w, h, needsSizing = true;
		
		this.drawWithHandler(function(frame, idx){
			if (needsSizing)
			{
				w = frame.buffer.width;
				h = frame.buffer.height;
				
				canvas.width = w;
				canvas.height = h;
				
				needsSizing = false;
			}
			
			ctx.clearRect(0, 0, w, h);
			
			frame.drawBufferInContext(ctx);
		});
	};
	
	/*
	 *
	 * - drawWithHandler: Use this to do custom drawing.
	 					  Useful when drawing multiple sprites to the same
	 					  canvas.
	 *	Parameters:
	 		- handler. A callback function called every time a frame needs to
	 				   be displayed. See -drawWithCanvas implementation for an
	 				   example.
	 				   
	 				  - frame: (FatFrame) The frame.
	 				  - idx: (Integer) Index of the frame.
	 				  
	 				   The handler is stored as .drawingHandler.
	 *
	 */
	 
	FatPixels.prototype.drawWithHandler = function(handler) {
		var _this = this;
		
		_this.drawingHandler = handler;
		
		_this.renderFrames(function(){
			
			if (_this.options.autoplay)
				_this.isAnimating = (_this.frames.length > 1);
			
			_this.needsDisplay();
		});
	};
	
	FatPixels.prototype.drawingHandler = function(frame, idx){
		//
		//	Set using -drawWithHandler.
		//
		console.warn("FatPixels: Empty implementation for -drawingHandler.");
	};
	
	/*
	 *
	 * - needsDisplay: Manages animation and the drawing of frames.
	 *
	 */
	FatPixels.prototype.needsDisplay = function() {
		var _this = this;
	
		var _isAnimating = _this.isAnimating,
			_frames = _this.frames,
			_idx = _this.frame;
		
		var _onAnimation = _this.options.onAnimation;
		
		var i = _this.options.speed;
		
		if (typeof i == "string" || i instanceof String)
		{
			if (suffix(i, "fps"))
			{
				i = 1000 / parseFloat(i);
			}
			else if (suffix(i, "ms"))
			{
				i = parseFloat(i);
			}
			else if (suffix(i, "s"))
			{
				i = parseFloat(i) * 1000;
			}
		}
		
		if (!_this.drawingInterval)
		{
			_this.drawingInterval = requestInterval(function(){
				_idx++;
				
				if (_idx == _frames.length)
				{
					_idx = 0;
					
					if (_this.options.loop == false)
						setTimeout(function(){
							_this.setAnimating(false);
						}, 1);
				}
				
				_this.drawingHandler(_frames[_idx], _idx);
				
				if (_onAnimation)
					_onAnimation(_idx);
				
			}, i);
		}
			
		if (!_isAnimating)
		{
			clearRequestInterval(_this.drawingInterval);
			
			delete _this.drawingInterval;
		}
		
		_this.drawingHandler(_frames[_idx], _idx);
	};
	
	/*
	 *
	 * - setAnimating: Pauses or resumes the animation.
	 *	Parameters:
	 		- animating. True or false for play/pause.
	 		
	 * - (BOOL)isAnimating : Returns true or false if animating.
	 *
	 */
	
	FatPixels.prototype.setAnimating = function(animating) {
		if (animating != this.isAnimating)
		{
			this.isAnimating = animating;
			this.needsDisplay();
		}
	};
	
	/*
	 *
	 * - setFrame: Sets the current frame.
	 *	Parameters:
	 		- idx. An index for the desired frame.
	 		
	 * - (Integer)frame: Returns the current displayed frame index.
	 *
	 */
	
	FatPixels.prototype.setFrame = function(idx) {
		if (idx != this.frame && idx < this.frames.length)
		{
			this.frame = idx;
			this.needsDisplay();
		}
	};
	
	/*
	 *
	 * Quickies for animation.
	 *
	 */
	
	FatPixels.prototype.pause = function() {
		this.setAnimating(false);
	};
	
	FatPixels.prototype.play = function() {
		this.setAnimating(true);
	};
	
	FatPixels.prototype.stop = function() {
		this.setAnimating(false);
		this.setFrame(0);
	};
	
	/*
	 *
	 * jQuery Plugin.
	 *
	 * 	Works when jQuery is available. The FatPixels object
	 *	can be found using data() on a jQuery object.
	 *
	 	var myFatPixelsObject = $("figure.example").FatPixels({...});
	 
	 	myFatPixelsObject.pause();
	 	myFatPixelsObject.setFrame(4);
	 	myFatPixelsObject.play();
	 *	
	 */
	 
	if (typeof jQuery == 'function')
	{
		(function($){
		
			$.fn.FatPixels = function(opts) {
				this.each(function() {
					var $this = $(this),
					data = $this.data();
					
					if (data.pixels)
					{
						data.pixels.remove();
						delete data.pixels;
					}
					
					if (opts !== false)
					{
						data.pixels = new FatPixels(opts);
						
						if (this.tagName.toLowerCase() === "canvas")
							data.pixels.drawWithCanvas(this);
						else
							data.pixels.drawWithTarget(this);
						
					}
					
					return data.pixels;
				});
				
				return this;
			};
		
		})(jQuery);
	}
	
	/*
	 *
	 * Define the FatPixels public constructors on the global scope.
	 *
	 */
	
	if (typeof define == 'function' && define.amd)
	{
    	define(function() { return FatPixels });
    	define(function() { return FatFrame });
    }
    else
    {
    	window.FatPixels = FatPixels;
    	window.FatFrame = FatFrame;
    }
    
})(window, document);