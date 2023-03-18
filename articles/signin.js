function onSignIn(googleUser) {
    var profile = googleUser.getBasicProfile();
    $("name").val(profile.getName());
    $("email").val(profile.getEmail());
    $("profile").val("src". profile.getImageUrl());
    $("data").css("display", "block");
    $(".g-signin2").css("display", "none");

}

function signOut() {
    var auth2 = gapi.auth2.getAuthInstance();
    auth2.signOut().then(function () {
        $("data").css("display", "none");
        $(".g-signin2").css("display", "block");
    });
}
