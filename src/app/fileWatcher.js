/**
 * watch file api
 */

'use strict';

var fs = require('fs'),
	path = require('path'),
	$ = global.jQuery,
	storage = require('./storage.js'),
	compiler = require('./compiler.js'),
	child_process = require('child_process'),
	notifier = require('./notifier.js');

var projectsDb = storage.getProjects(),
	watchedCollection = {},	//watched file Collection
	importsCollection = {
		//src: [parentSrc,...]
	};	//imports Collection

/**
 * add file 
 * @param {Object Array || single Object} fileInfo files info
 */
exports.add = function(fileInfo) {
	if(Array.isArray(fileInfo)){
		fileInfo.forEach(function(item) {
			var pid = item.pid,
				src = item.src,
				file = projectsDb[pid].files[src];
			addWatchListener(src);
			watchedCollection[src] = $.extend({}, file);
		});
	}else{
		var pid = fileInfo.pid,
			src = fileInfo.src;
		addWatchListener(src);
		watchedCollection[src] = $.extend({}, projectsDb[pid].files[src]);
	}
}

/**
 * remove file
 * @param  {String Array || single String} fileSrc file src
 */
exports.remove = function(fileSrc) {
	if(Array.isArray(fileSrc)){
		fileSrc.forEach(function(item) {
			removeWatchListener(item);
			delete watchedCollection[item];
		});
	}else{
		removeWatchListener(fileSrc);
		delete watchedCollection[fileSrc]
	}
}

/**
 * update file
 * @param  {Object Array || single Object} file file object
 */
exports.update = function(fileInfo) {
	if (Array.isArray(fileInfo)) {
		fileInfo.forEach(function(item) {
			//更新
			var pid = item.pid,
				src = item.src,
				file = projectsDb[pid].files[src];
			watchedCollection[src] = $.extend({},watchedCollection[src],file);
		});
	} else {
		//更新
		var pid = fileInfo.pid,
			src = fileInfo.src,
			file = projectsDb[pid].files[src];
		watchedCollection[src] = $.extend({},watchedCollection[src],file);
	}
}

/**
 * change compile status
 * @param  {String}   pid            file project id
 * @param  {String}   fileSrc        file src
 * @param  {Boolean}  compileStatus  target status
 */
exports.changeCompile = function(pid, fileSrc,compileStatus) {
	if (compileStatus && !watchedCollection[fileSrc]) {
		addWatchListener(fileSrc);
		watchedCollection[fileSrc] = projectsDb[pid].files[fileSrc];
	}

	watchedCollection[fileSrc].compile = compileStatus;
}

/**
 * add imports file
 * @param {Array} files   imports
 * @param {Array} paths   import folder path
 * @param {String} srcFile import's src
 */
exports.addImports = function(imports, srcFile) {
	var importsString = imports.join(','),
		oldImports = watchedCollection[srcFile].imports || [],
		oldImportsString = oldImports.join(','),
		invalidImports,
		newImports;

	//filter invalid file
	invalidImports = oldImports.filter(function(item) {
		return importsString.indexOf(item) === -1
	});

	invalidImports.forEach(function(item) {
		importsCollection[item] = importsCollection[item].filter(function(element) {
			return element !== srcFile;
		});
	});

	//add import
	newImports = imports.filter(function(item) {
		return oldImportsString.indexOf(item) === -1;
	});

	newImports.forEach(function(item) {
		if (importsCollection[item]) {
			//has in importsCollection
			importsCollection[item].push(srcFile);
		} else {
			//add to importsCollection
			importsCollection[item] = [srcFile];
			watchImport(item);
		}
	});

	watchedCollection[srcFile].imports = imports;
}


/**
 * get watchedCollection
 * @return {Object}
 */
exports.getWatchedCollection = function() {
	return watchedCollection;
};

/**
 * get importCollection
 * @return {Object}
 */
exports.getImportsCollection = function() {
	return importsCollection;
};

/**
 * set importsCollection
 * @param {Obejct} importsDb importsCollection 
 */
exports.setImportsCollection = function(importsDb) {
	importsCollection = importsDb;
};


/**
 * add watch listener
 * @param {String} src file src
 */
function addWatchListener(src) {
	if (importsCollection[src]) {
		return false;
	}
	
	if (watchedCollection[src]) {
		fs.unwatchFile(src);
	}

	fs.watchFile(src, {interval: 500}, function(curr){
		if (curr.mode === 0) return false;

		//when file change,compile
		var file = watchedCollection[src];

		/* 
		 * Original process here.
		 */
		//if (file.compile) compiler.runCompile(file);

		/*
		 * Custom changes start here.
		 */
		if (file.compile) {
			// Execute mvn process to build CSS.
			notifier.showNotification("About to start maven process.");
			child_process.exec("mvn -Pprod process-resources", {
				cwd: "/home/derekf/Development/clearview/"
			}, function(err, stdout, stderr){
				if (err) {
					// Problem executing the maven profile.
					notifier.throwAppError(err.stack);
					return;
				}
				notifier.showNotification("Maven Prod profile process-resources successful.");
				return;
			});
		}
	});
}

/**
 * remove watch listener
 * @param  {String} src file src
 */
function removeWatchListener(src) {
	if (!importsCollection[src] || importsCollection[src].length === 0) {
		fs.unwatchFile(src);	
	}
}

/**
 * add watch listener to import file,when import file changed,compile self and src file
 * @param  {String} fileSrc import file src
 */
function watchImport(fileSrc) {
	if (Array.isArray(fileSrc)) {
		fileSrc.forEach(function (item) {
			watch(item);
		});
	} else {
		watch(fileSrc);
	}

	function watch (src) {
		//delete old listener
		if (watchedCollection[src]) {
			fs.unwatchFile(src);
		}

		fs.watchFile(src, {interval: 500}, function(curr) {
			if (curr.mode === 0) return false;
			
			//compile self
			var self = watchedCollection[src];
			if (self && self.compile) compiler.runCompile(self);

			//compile src file
			var parents = importsCollection[src];
			parents.forEach(function(item) {
				//only compiling when the parent file had in watchedCollection
				var parent = watchedCollection[item];
				if (parent && parent.compile) {
					compiler.runCompile(parent);
				}
			});
		});
	}
}
exports.watchImport = watchImport;