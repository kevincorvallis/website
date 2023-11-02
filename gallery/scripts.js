// Image names you've provided
let imageNames = [
    '1.jpg', '2.jpg', '3.jpeg', '5.jpeg', 
    '6.jpg', '7.jpg', '8.jpeg', '9.jpeg',
    '10.jpeg', '11.jpeg', '12.jpeg'
];

// Function to shuffle an array
function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

// Shuffle the imageNames array
shuffle(imageNames);

// Append shuffled images to the gallery
const galleryDiv = document.getElementById('image-gallery');
imageNames.forEach(image => {
    const imgElement = document.createElement('img');
    imgElement.src = `path_to_your_directory/${image}`;
    galleryDiv.appendChild(imgElement);
});


// Parse slide data (url, title, size...) from DOM elements 
// (children of gallerySelector)
var parseThumbnailElements = function(el) {
    var thumbElements = el.getElementsByTagName('figure'),
        numNodes = thumbElements.length,
        items = [],
        figureEl,
        linkEl,
        size,
        item;

    for(var i = 0; i < numNodes; i++) {
        figureEl = thumbElements[i]; // <figure> element
        // Include only element nodes 
        if(figureEl.nodeType !== 1) {
            continue;
        }
        linkEl = figureEl.children[0]; // <a> element
        size = linkEl.getAttribute('data-size').split('x');
        // Create slide object
        item = {
            src: linkEl.getAttribute('href'),
            w: parseInt(size[0], 10),
            h: parseInt(size[1], 10)
        };
        if(figureEl.children.length > 1) {
            // <figcaption> content
            item.title = figureEl.children[1].innerHTML; 
        }
        if(linkEl.children.length > 0) {
            // <img> thumbnail element, retrieving thumbnail url
            item.msrc = linkEl.children[0].getAttribute('src');
        } 
        item.el = figureEl; // Save link to element for getThumbBoundsFn
        items.push(item);
    }
    return items;
};

// Find nearest parent element
var closest = function closest(el, fn) {
    return el && (fn(el) ? el : closest(el.parentNode, fn));
};

// Triggers when user clicks on thumbnail
var onThumbnailsClick = function(e) {
    e = e || window.event;
    e.preventDefault ? e.preventDefault() : e.returnValue = false;

    var eTarget = e.target || e.srcElement;

    // Find root element of slide
    var clickedListItem = closest(eTarget, function(el) {
        return (el.tagName && el.tagName.toUpperCase() === 'FIGURE');
    });

    if(!clickedListItem) {
        return;
    }

    // Find index of clicked item by looping through all child nodes
    var clickedGallery = clickedListItem.parentNode,
        childNodes = clickedListItem.parentNode.getElementsByTagName('figure'),
        numChildNodes = childNodes.length,
        nodeIndex = 0,
        index;

    for (var i = 0; i < numChildNodes; i++) {
        if(childNodes[i].nodeType !== 1) { 
            continue; 
        }
        if(childNodes[i] === clickedListItem) {
            index = nodeIndex;
            break;
        }
        nodeIndex++;
    }
    if(index >= 0) {
        // Open PhotoSwipe if valid index found
        openPhotoSwipe( index, clickedGallery );
    }
    return false;
};

var photoswipeParseHash = function() {
    var hash = window.location.hash.substring(1),
        params = {};

    if(hash.length < 5) {
        return params;
    }

    var vars = hash.split('&');
    for (var i = 0; i < vars.length; i++) {
        var pair = vars[i].split('=');  
        if(!pair[0]) continue;
        params[pair[0]] = pair[1];
    }

    if(params.gid) {
        params.gid = parseInt(params.gid, 10);
    }

    return params;
};

var openPhotoSwipe = function(index, galleryElement, disableAnimation, fromURL) {
    var pswpElement = document.querySelectorAll('.pswp')[0],
        gallery,
        options,
        items;

    items = parseThumbnailElements(galleryElement);

    // define options (if needed)
    options = {
        index: index,

        // define gallery index (for URL)
        galleryUID: galleryElement.getAttribute('data-pswp-uid'),

        getThumbBoundsFn: function(index) {
            var thumbnail = items[index].el.getElementsByTagName('img')[0], // find thumbnail
                pageYScroll = window.pageYOffset || document.documentElement.scrollTop,
                rect = thumbnail.getBoundingClientRect(); 

            return {x:rect.left, y:rect.top + pageYScroll, w:rect.width};
        }
    };

    // PhotoSwipe opened from URL
    if(fromURL) {
        if(options.galleryPIDs) {
            // parse real index when custom PIDs are used 
            for(var j = 0; j < items.length; j++) {
                if(items[j].pid == index) {
                    options.index = j;
                    break;
                }
            }
        } else {
            options.index = parseInt(index, 10) - 1;
        }
    } else {
        options.index = parseInt(index, 10);
    }

    // exit if index not found
    if( isNaN(options.index) ) {
        return;
    }

    if(disableAnimation) {
        options.showAnimationDuration = 0;
    }

    // Pass data to PhotoSwipe and initialize it
    gallery = new PhotoSwipe( pswpElement, PhotoSwipeUI_Default, items, options);
    gallery.init();
};

// Loop through all gallery elements and bind events
var galleryElements = document.querySelectorAll( gallerySelector );

for(var i = 0, l = galleryElements.length; i < l; i++) {
    galleryElements[i].setAttribute('data-pswp-uid', i+1);
    galleryElements[i].onclick = onThumbnailsClick;
}

// Parse URL and open gallery if it contains #&pid=3&gid=1
var hashData = photoswipeParseHash();
if(hashData.pid && hashData.gid) {
    openPhotoSwipe( hashData.pid ,  galleryElements[ hashData.gid - 1 ], true, true );
}
