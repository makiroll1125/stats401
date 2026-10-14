function highlightCountry(country) {

    d3.selectAll(".country")
        .classed(
            "selected",
            d =>
                d.properties.name
                === country
        );
}

const SpeechRecognition =
    window.SpeechRecognition
    ||
    window.webkitSpeechRecognition;

if (!SpeechRecognition) {

    console.log(
        "Speech recognition is not supported."
    );
}

const recognition =
    new SpeechRecognition();

recognition.lang = "en-US";
recognition.continuous = false;
recognition.interimResults = false;

d3.select("#voice-button")
    .on("click", function() {

        recognition.start();

        d3.select("#voice-status")
            .text("Listening...");
    });

recognition.onresult =
    function(event) {

        const transcript =
            event.results[0][0]
            .transcript
            .toLowerCase()
            .trim();

        d3.select("#voice-status")
            .text(
                `Heard: ${transcript}`
            );

        handleVoiceCommand(
            transcript
        );
    };

function handleVoiceCommand(
    command
) {

    if (
        command.includes("reset")
    ) {

        resetVisualization();

    }

    else if (
        command.includes("show asia")
    ) {

        filterRegion("Asia");

    }

    else if (
        command.includes("show europe")
    ) {

        filterRegion("Europe");

    }

    else {

        showCommandError(
            command
        );
    }
}

const video =
    document.getElementById(
        "camera"
    );

const stream =
    await navigator
    .mediaDevices
    .getUserMedia({
        video: true
    });

video.srcObject =
    stream;


function handleGesture(
    gesture
) {

    if (
        gesture === "Open_Palm"
    ) {

        resetVisualization();

    }

    else if (
        gesture === "Pointing_Up"
    ) {

        showDetails();

    }

    else if (
        gesture === "Thumb_Up"
    ) {

        confirmSelection();
    }
}

let lastGestureTime = 0;

const cooldown = 1000;

function triggerGesture(
    gesture
) {

    const now =
        Date.now();

    if (
        now - lastGestureTime
        < cooldown
    ) {

        return;
    }

    lastGestureTime = now;

    handleGesture(
        gesture
    );
}

function gazeListener(
    data
) {

    if (!data) {
        return;
    }

    updateGazeCursor(
        data.x,
        data.y
    );
}

function updateGazeCursor(
    x,
    y
) {

    d3.select("#gaze-cursor")
        .style(
            "left",
            `${x}px`
        )
        .style(
            "top",
            `${y}px`
        );
}

