(function($) {

	var $window = $(window),
		$body = $('body'),
		$sidebar = $('#sidebar');

	// Play initial animations on page load.
	$window.on('load', function() {
		window.setTimeout(function() {
			$body.removeClass('is-preload');
		}, 100);
	});

	// Remove unnecessary elements
	$('header, #footer').remove();

	// Sidebar.
	if ($sidebar.length > 0) {

		var $sidebar_a = $sidebar.find('a');

		$sidebar_a.each(function() {

			var $this = $(this),
				id = $this.attr('href'),
				$section = $(id);

			if ($section.length < 1)
				return;

			// Scrollex.
			$section.scrollex({
				mode: 'middle',
				top: '-20vh',
				bottom: '-20vh',
				initialize: function() {
					// Deactivate section.
					$section.addClass('inactive');
				},
				enter: function() {
					// Activate section.
					$section.removeClass('inactive');
				}
			});
		});
	}

	// Scrolly.
	$('.scrolly').scrolly({
		speed: 1000,
		offset: function() {
			if ($sidebar.length > 0)
				return $sidebar.height();
			return 0;
		}
	});

})(jQuery);
