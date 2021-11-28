/* SEM_simulator javascript functions    

Created  by Andres Vasquez for AMMRF'S www.myscope.training
info@andresvasquez.net  —— www.andresvasquez.net ——
copyright:This work is licensed under a Creative Commons Attribution 4.0 International License.

************************************************************************/
var canvas = document.querySelector("#micrograph");
var ctx = canvas.getContext("2d");
var bufferCanvas = document.createElement("canvas");
bufferCanvas.setAttribute("id", "buffer");
var bufferCanvasCtx = bufferCanvas.getContext("2d");
var bufferC = document.createElement("canvas");
var bufferCctx = bufferC.getContext("2d");
var stage = new createjs.Stage(bufferCanvas);
var image = new Image();
var simulatorBase = document.getElementById("simulator-base");
var example_img = document.getElementById("example-img");
var knob = document.getElementsByClassName("knob");
var startChamber;
var vidChamber;
var vidChamberTimeout;
var SE_sample1 = "/static/simulator/sem_simulator/images/simulator/SEM/wood_SE.jpg";
var SE_sample2 = "/static/simulator/sem_simulator/images/simulator/SEM/pollen_SE.jpg";
var SE_sample3 = "/static/simulator/sem_simulator/images/simulator/SEM/rock_SE.jpg";
var SE_sample4 = "/static/simulator/sem_simulator/images/simulator/SEM/steel_SE.jpg";
var BSE_sample1 = "/static/simulator/sem_simulator/images/simulator/SEM/wood_BSE.jpg";
var BSE_sample2 = "/static/simulator/sem_simulator/images/simulator/SEM/pollen_BSE.jpg";
var BSE_sample3 = "/static/simulator/sem_simulator/images/simulator/SEM/rock_BSE.jpg";
var BSE_sample4 = "/static/simulator/sem_simulator/images/simulator/SEM/steel_BSE.jpg";
var currentSEsample = SE_sample1;
var currentBSEsample = BSE_sample1;
var alpha = 0;
var delta = 0.005;
var topImage = 57;
var initImage = 0;
var counter = 0;
var chamberOpen = false;
var samplePlaced = false;
var stageRotation = false;
var bse_switch = false;
var sprite = new Array();
var toggle = true;
var doTheNoise;
var dotvNoise;
var simInstruction;
var randomNegative = Math.random() < 0.5 ? -1 : 1;
var randomBrightness = getRandomInt(160, 190);
var brightnessIncrement = 0;
var volt_bool = false;
var volt_values = [0, 0.1, 0.3, 1.5, 1.9];
var kVs = volt_values[0];
var spot_valuesBright = [0.1, 0.15, 0.2, 0.25, 0.3];
var spot_bright = spot_valuesBright[0];
var brightNms = 0;
var brightnessValue = 0;
var randomContrast = getRandomInt(100, 190);
var contrastAmount = getRandomInt(5, 15) / 10;
var contrastIncrement = 0;
var spot_valuesBlur = [0.5, 1, 1.5, 2, 2.5];
var spotSlider_blur = spot_valuesBlur[0];
var z_values = [5, 3.25, 2.5, 1.75, 1, 0];
var zBlur = z_values[0];
var coarseKnob = 0;
var fineKnob = 0;
var astigm_blur = (getRandomInt(20, 50) / 10) * randomNegative;
var astig_X = 0;
var astig_Y = 0;
var trim_values = [1, 1.12, 1.14, 1.16, 1.18, 1.20];
var trim = 1;
var noise = "tv_rate";
var lastScanUsed = "";
var p1 = 0.3;
var p2 = 0.59;
var p3 = 0.11;
var er = 0; // extra red
var eg = 0; // extra green
var eb = 0; // extra blue
var img_loaded;
var htOn = false;
var stretch = 1;
var scaleBar_size;
var scaleBar_unit;
var imgData;
var imgData_forScan;
var x_factor = 10;
var y_factor = 10;
var x = 0;
var y = 0;
var fromScanModes = false;
// ======================= jQuery Drag and Drop on touch devices =============================== //
(function ($) {
    // Detect touch support
    $.support.touch = 'ontouchend' in document;
    // Ignore browsers without touch support
    if (!$.support.touch) {
        return;
    }
    var mouseProto = $.ui.mouse.prototype
        , _mouseInit = mouseProto._mouseInit
        , touchHandled;

    function simulateMouseEvent(event, simulatedType) { //use this function to simulate mouse event
        // Ignore multi-touch events
        if (event.originalEvent.touches.length > 1) {
            return;
        }
        event.preventDefault(); //use this to prevent scrolling during ui use
        var touch = event.originalEvent.changedTouches[0]
            , simulatedEvent = document.createEvent('MouseEvents');
        // Initialize the simulated mouse event using the touch event's coordinates
        simulatedEvent.initMouseEvent(simulatedType, // type
            true, // bubbles                    
            true, // cancelable                 
            window, // view                       
            1, // detail                     
            touch.screenX, // screenX                    
            touch.screenY, // screenY                    
            touch.clientX, // clientX                    
            touch.clientY, // clientY                    
            false, // ctrlKey                    
            false, // altKey                     
            false, // shiftKey                   
            false, // metaKey                    
            0, // button                     
            null // relatedTarget              
        );
        // Dispatch the simulated event to the target element
        event.target.dispatchEvent(simulatedEvent);
    }
    mouseProto._touchStart = function (event) {
        var self = this;
        // Ignore the event if another widget is already being handled
        if (touchHandled || !self._mouseCapture(event.originalEvent.changedTouches[0])) {
            return;
        }
        // Set the flag to prevent other widgets from inheriting the touch event
        touchHandled = true;
        // Track movement to determine if interaction was a click
        self._touchMoved = false;
        // Simulate the mouseover event
        simulateMouseEvent(event, 'mouseover');
        // Simulate the mousemove event
        simulateMouseEvent(event, 'mousemove');
        // Simulate the mousedown event
        simulateMouseEvent(event, 'mousedown');
    };
    mouseProto._touchMove = function (event) {
        // Ignore event if not handled
        if (!touchHandled) {
            return;
        }
        // Interaction was not a click
        this._touchMoved = true;
        // Simulate the mousemove event
        simulateMouseEvent(event, 'mousemove');
    };
    mouseProto._touchEnd = function (event) {
        // Ignore event if not handled
        if (!touchHandled) {
            return;
        }
        // Simulate the mouseup event
        simulateMouseEvent(event, 'mouseup');
        // Simulate the mouseout event
        simulateMouseEvent(event, 'mouseout');
        // If the touch interaction did not move, it should trigger a click
        if (!this._touchMoved) {
            // Simulate the click event
            simulateMouseEvent(event, 'click');
        }
        // Unset the flag to allow other widgets to inherit the touch event
        touchHandled = false;
    };
    mouseProto._mouseInit = function () {
        var self = this;
        // Delegate the touch handlers to the widget's element
        self.element.on('touchstart', $.proxy(self, '_touchStart')).on('touchmove', $.proxy(self, '_touchMove')).on('touchend', $.proxy(self, '_touchEnd'));
        // Call the original $.ui.mouse init method
        _mouseInit.call(self);
    };
})(jQuery);
// ======================= END jQuery Drag and Drop on touch devices END =============================== //
// ========= ================START TOUCHDEVICE CONDITIONALS=========== =================== //
function isTouchDevice() {
    if (('ontouchstart' in window || navigator.maxTouchPoints > 0) || window.DocumentTouch && document instanceof DocumentTouch) {
        simulatorBase.style.width = "100%";
        simulatorBase.style.height = "64vw";
    }
    else {
        //        return "nah, this isn't a touch screen device";
    }
}
isTouchDevice();
// ========= =============== END TOUCHDEVICE CONDITIONALS END ========= =================== //
// ======================= ================START SIMULATOR (INIT)================= ======================== //
function initSimulator() {
    img_loaded = false;
    image.src = currentSEsample;
    example_img.src = image.src;
    image.onload = function () {
        img_loaded = true;
    }
    htOn = false;
}
//initSimulator();
// ======================= ================ END END SIMULATOR (INIT)================= ==================== //
// ======================= ============== START SLIDERS ============= ======================== //
$(document).ready(function () {
    $("#acc-volt").slider({
        range: "min"
        , value: 0
        , min: 0
        , max: 4
        , step: 1
        , animate: true
        , slide: function (event, ui) {
            kVs = volt_values[ui.value];
            if (kVs == 0) {
                brightNms = 0;
            }
            else {
                brightNms = kVs + spot_bright;
                if (!volt_bool) {
                    askHTon();
                    volt_bool = true;
                }
            }
        }
        , disabled: true
        , stop: function (event, ui) {
            if (htOn) {
                drawIt();
            }
        }
    });
    $("#spot-size").slider({
        range: "min"
        , value: 0
        , min: 0
        , max: 4
        , step: 1
        , animate: true
        , slide: function (event, ui) {
            spot_bright = spot_valuesBright[ui.value];
            if (kVs == 0) {
                brightNms = 0;
            }
            else {
                brightNms = kVs + spot_bright;
            }
            //
            spotSlider_blur = (spot_valuesBlur[ui.value]);
        }
        , disabled: true
        , stop: function (event, ui) {
            drawIt();
        }
    });
    $("#z-pos").slider({
        range: "min"
        , value: 0
        , min: 0
        , max: 5
        , step: 1
        , animate: true
        , slide: function (event, ui) {
            zBlur = z_values[ui.value];
            trim = (trim_values[ui.value]);
        }
        , disabled: true
        , stop: function (event, ui) {
            // HERE GOES THE - Z-HEIGHT BROKEN STAGE??      
            if (zBlur == 0) {
                toogle_fn("#micrograph", "totally-hidden", false);
                toogle_fn(".broken", "totally-hidden", true);
            }
            else {
                drawIt();
            }
        }
    });
    $(".example-content").draggable();
    $(".example-content").resizable({
        handles: "n, e, s, w, sw, se, nw, ne"
        , resize: function (event, ui) {
            drawIt();
        }
    });
});
// ===================== ============== END SLIDERS END ============= ======================== //
// ======================= ================START KNOB =============== ======================== //
TweenLite.set(["#brightness", "#contrast", "#focus-c", "#focus-f", "#astigmatism-x", "#astigmatism-y"], {
    rotation: 140
});
var focusOn = false;

function keyRotationEnds() {
    focusOn = false;
}

function keyRotation(me) {
    focusOn = true;
    thisKnob = Draggable.get("#" + me.id);
    document.onkeyup = checkKey;

    function checkKey(e) {
        if (focusOn) {
            e = e || window.event;
            if (e.keyCode == '37') {
                // left arrow
                if (thisKnob.rotation > 2) {
                    TweenLite.to(("#" + me.id), 0, {
                        rotation: "-=2"
                    });
                    thisKnob.rotation -= 2;
                    onRotateKnob(me.id);
                }
            }
            else if (e.keyCode == '39') {
                // right arrow
                if (thisKnob.rotation < 268) {
                    TweenLite.to(("#" + me.id), 0, {
                        rotation: "+=2"
                    });
                    thisKnob.rotation += 2;
                    onRotateKnob(me.id);
                }
            }
        }
    }
}

function focusKnob(me) {
    document.getElementById(me).focus();
}

function onRotateKnob(me) {
    document.getElementById(me).focus();
    var dragKnob = Draggable.get("#" + me);
    var activeTicks = (Math.round(dragKnob.rotation / 15));
    var knobAngle = $(".led-" + me).removeClass('activeled');
    $(".led-" + me).slice(0, activeTicks).addClass('activeled');
    knobPos = dragKnob.rotation;
    switch (me) {
    case "brightness":
        if (knobPos >= randomBrightness) {
            brightnessIncrement = Math.floor(((knobPos - randomBrightness) / 10) + 1);
            if (brightnessIncrement < 0) brightnessIncrement *= (-1);
        }
        else {
            brightnessIncrement = Math.round(knobPos - 140);
            if (knobPos <= 140) {
                brightnessIncrement = brightnessIncrement / 50;
            }
            else {
                brightnessIncrement = (brightnessIncrement / (randomBrightness - 140)) * (.99);
                brightnessIncrement = Math.round(brightnessIncrement * 100) / 100;
            }
        }
        break;
    case "contrast":
        if (knobPos > randomContrast) {
            contrastIncrement = ((knobPos - randomContrast) / (270 - randomContrast)) / 1.5;
            contrastIncrement = Math.round(contrastIncrement * 100) / 100;
            contrastIncrement *= (-1);
        }
        else {
            contrastIncrement = (((knobPos / randomContrast) * -1) + 1) / 1.5;
            contrastIncrement = Math.round(contrastIncrement * 100) / 100;
        }
        break;
    case "magnification":
        stretch = ((knobPos / 270) * 2.4) + 1.1;
        break;
    case "focus-c":
        if (knobPos > 140) {
            coarseKnob = ((knobPos - 140) / 130) * 10;
            coarseKnob = Math.round(coarseKnob * 100) / 100;
        }
        else {
            coarseKnob = ((knobPos / 140) * -10) + 10;
            coarseKnob = Math.round(coarseKnob * 100) / 100;
        }
        break;
    case "focus-f":
        if (knobPos >= 140) {
            fineKnob = Math.round(knobPos - 140) / 50;
        }
        else {
            fineKnob = Math.round((knobPos - 140) * (-1)) / 50;
        }
        break;
    case "astigmatism-x":
        if (knobPos >= 140) {
            astig_X = Math.round(knobPos - 140) / 25;
        }
        else {
            astig_X = Math.round((knobPos - 140) * (-1)) / 25;
        }
        break;
    case "astigmatism-y":
        if (knobPos >= 140) {
            astig_Y = Math.round(knobPos - 140) / 25;
        }
        else {
            astig_Y = Math.round((knobPos - 140) * (-1)) / 25;
        }
        break;
    }
    drawIt();
}
var myDraggable = Draggable.create(knob, {
    type: "rotation"
    , throwProps: true
    , edgeResistance: 0.99
    , bounds: {
        minRotation: 0
        , maxRotation: 270
    }
    , onDrag: function (e) {
        onRotateKnob(this.target.id)
    }
    , onThrowUpdate: function (e) {
        onRotateKnob(this.target.id)
    }
    , onClick: function (e) {
        focusKnob(this.target.id)
    }
    , overshootTolerance: 0
});
//var myDraggable = Draggable.create(knob, {
//    type: "rotation"
//    , throwProps: true
//    , edgeResistance: 0.99
//    , bounds: {
//        minRotation: 0
//        , maxRotation: 270
//    }
//    , onDrag: function (e) {
//        this.target.focus()
//    }
//    , onDragEnd: function (e) {
//        onRotateKnob(this.target.id)
//    }
//    , overshootTolerance: 0
//});
// ======================= ================ END END KNOB ================ ==================== //
// ======================= =========== START WHITE NOISE ============ ======================== //
function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    bufferCanvas.width = window.innerWidth;
    bufferCanvas.height = window.innerHeight;
    drawIt();
}
resize();
window.onresize = resize;

function noise_fn() {
    var w = ctx.canvas.width
        , h = ctx.canvas.height
        , idata = bufferCanvasCtx.createImageData(w, h)
        , buffer32 = new Uint32Array(idata.data.buffer)
        , len = buffer32.length
        , i = 0;
    for (; i < len;) buffer32[i++] = ((255 * Math.random()) | 0) << 24;
    bufferCanvasCtx.putImageData(idata, 0, 0);
    var imageData = bufferCanvasCtx.getImageData(0, 0, bufferCanvas.width, bufferCanvas.height);
    ctx.putImageData(imageData, 0, 0);
}

function whiteNoise() {
    toggle = !toggle;
    if (toggle) {
        doTheNoise = requestAnimationFrame(whiteNoise);
        return;
    }
    noise_fn();
    doTheNoise = requestAnimationFrame(whiteNoise);
};
whiteNoise();
var tvCounter = 2;

function tvDraw() {
    fromScanModes = false;
    ctx.putImageData(imgData_forScan, 0, 0, 0, 0, canvas.width * trim, (tvCounter - 1));
}
var fRate;

function tvNoise() {
    if (tvCounter < ctx.canvas.height) {
        tvDraw();
        dotvNoise = requestAnimationFrame(tvNoise);
        tvCounter += fRate;
    }
    else {
        cancelAnimationFrame(tvNoise);
        tvCounter = 2;
    };
};
// ======================= ======== END  WHITE NOISE END ============== ==================== //
// ======================= ================START TOOLTIPS ================= ======================== //
function myInstructionA(idTooltiped, txt) {
    var controls = ["btn-vent", "btn-chamber", "btn-evacuate", "btn-tvrate", "btn-scan1", "btn-scan2", "btn-save", "btn-print", "btn-se", "ht-btn", "acc-volt", "spot-size", "z-pos", "brightness", "contrast", "magnification", "focus-c", "focus-f", "astigmatism-x", "astigmatism-y"];
    $.each(controls, function (index, val) {
        $('#' + val).removeClass(val + "-disabled");
        $('#' + val).removeClass("btn-active"); //remove the active
        if (val !== idTooltiped) {
            $("#" + val).attr('disabled', true);
            $("#" + val).toggleClass(val + "-disabled");
            if ($("#" + val).hasClass("knob")) {
                $("#" + val).css('display', 'none');
                $("#" + val).parent().css("opacity", "0.6");
                $("#" + val).parent().css("cursor", "not-allowed");
            }
        }
    });
    $("#" + idTooltiped).removeClass(idTooltiped + "-disabled");
    $("#" + idTooltiped).removeAttr('disabled');
    $("#top-instructions-txt").html(txt);
    toogle_fn("#top-instructions", "top-instructions-on", false);
}

function myInstructionB(id1, txt) {
    $("#" + id1).removeClass(id1 + "-disabled");
    $("#" + id1).removeAttr('disabled');
    $("#top-instructions-txt").html(txt);
    toogle_fn("#top-instructions", "top-instructions-on", false);
}

function myInstructionVolt(txt) {
    $("#acc-volt").slider("enable");
    $("#acc-volt").removeClass("acc-volt-disabled");
    $("#acc-volt").removeAttr('disabled');
    $("#top-instructions-txt").html(txt);
    toogle_fn("#top-instructions", "top-instructions-on", false);
}

function myInstructionC(txt) {
    var controls = ["btn-tvrate", "btn-scan1", "btn-scan2", "btn-save", "btn-print", "btn-se", "brightness", "contrast", "magnification", "focus-c", "focus-f", "astigmatism-x", "astigmatism-y"];
    $.each(controls, function (index, val) {
        $('#' + val).removeClass(val + "-disabled");
        $("#" + val).removeAttr('disabled');
        if ($("#" + val).hasClass("knob")) {
            $("#" + val).css('display', 'block');
            $("#" + val).parent().css("opacity", "1");
            $("#" + val).parent().css("cursor", "pointer");
        }
    });
    enableSliders();
    $("#top-instructions-txt").html(txt);
    toogle_fn("#top-instructions", "top-instructions-on", false);
}
simInstruction = "First, let air into the sample chamber before you open it."
myInstructionA("btn-vent", simInstruction);
// ======================= ================ END END TOOLTIP ================= ==================== //
// ======================= ================START CONTROLLING IT================= ======================== //
//FIRST STEP
$('#btn-vent').click(function () {
    cancelAnimationFrame(doTheNoise);
    bufferCanvasCtx.drawImage(sprite[0], 0, 0, canvas.width, canvas.height);
    startChamber = requestAnimationFrame(chamberStarts);
    toogle_fn("#top-instructions", "top-instructions-on", true);
});
$('#btn-chamber').click(function () {
    alpha = 1;
    if (!$(this).hasClass("btn-active")) {
        stopLoop();
        if (!chamberOpen) {
            videoChamberAnimation(true, 0, 43);
        }
        else {
            videoChamberAnimation(true, 43, 66);
        }
        toogle_fn("#top-instructions", "top-instructions-on", true);
        chamberOpen = !chamberOpen;
    }
});
$('#btn-evacuate').click(function () {
    toogle_fn("#top-instructions", "top-instructions-on", true);
    evacuating();
});
$('#btn-se').click(function () {
    toogle_fn("#top-instructions", "top-instructions-on", true);
    simInstruction = "Set the accelerating voltage of the electron beam, its spot size, and the Z height distance from the sample."
    if (!bse_switch) {
        toogle_fn("#btn-se", "switch-btn", true);
        toogle_fn("#btn-se", "switch-btn-active", false);
        image.src = currentBSEsample;
        example_img.src = image.src;
    }
    else {
        toogle_fn("#btn-se", "switch-btn", false);
        toogle_fn("#btn-se", "switch-btn-active", true);
        image.src = currentSEsample;
        example_img.src = image.src;
    }
    image.onload = function () {
        drawIt();
    }
    bse_switch = !bse_switch;
});
$('#ht-btn').click(function () {
    toogle_fn(".ht-btn", "ht-btn-active", false);
    if (!htOn) {
        toogle_fn("#top-instructions", "top-instructions-on", true);
        stopLoop();
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.globalAlpha = 1;
        drawIt();
        setTimeout(function () {
            simInstruction = "Now you can freely manipulate all the other controls to adjust the image.";
            toogle_fn(".instructionsPanel", "totally-hidden", true);
            myInstructionC(simInstruction);
        }, 500);
    }
    else {
        otherSample();
    }
    htOn = true;
});

function enableSliders() {
    $("#acc-volt").slider("enable");
    $("#acc-volt").removeClass("acc-volt-disabled");
    $("#acc-volt").removeAttr('disabled');
    $("#spot-size").slider("enable");
    $("#spot-size").removeClass("spot-size-disabled");
    $("#spot-size").removeAttr('disabled');
    $("#z-pos").slider("enable");
    $("#z-pos").removeClass("z-pos-disabled");
    $("#z-pos").removeAttr('disabled');
}
$('#btn-tvrate').click(function () {
//    toogle_fn("#top-instructions", "top-instructions-on", true);
    fRate = 20;
    noise = "tv_rate";
    fromScanModes = true;
    lastScanUsed = "tv_rate";
    drawIt();
    tvNoise();
//    setTimeout(function () {
//        simInstruction = "Scan the electron beam across the sample at medium speed, Select Slow Scan 1"
//    }, 500);
});
$('#btn-scan1').click(function () {
//    toogle_fn("#top-instructions", "top-instructions-on", true);
    fRate = 6;
    noise = "scan1";
    fromScanModes = true;
    lastScanUsed = "scan1";
    drawIt();
    tvNoise();
//    setTimeout(function () {
//        simInstruction = "Scan the electron beam across the sample at medium speed, Select Slow Scan 1"
//    }, 500);
});
$('#btn-scan2').click(function () {
//    toogle_fn("#top-instructions", "top-instructions-on", true);
    fRate = 2;
    noise = "scan2";
    fromScanModes = true;
    drawIt();
    tvNoise();
//    setTimeout(function () {
//        simInstruction = "Scan the electron beam across the sample at medium speed, Select Slow Scan 1"
//    }, 500);
});

function chamberStarts() {
    alpha += delta;
    if (alpha >= 0.25) {
        cancelAnimationFrame(startChamber);
        alpha = 1;
        videoChamberAnimation(false, 0, 10);
        simInstruction = "Open the chamber and insert the samples."
        myInstructionA("btn-chamber", simInstruction);
    }
    else {
        startChamber = requestAnimationFrame(chamberStarts);
    }
    ctx.globalAlpha = alpha;
    ctx.drawImage(bufferCanvas, 0, 0, bufferCanvas.width, bufferCanvas.height);
}

function evacuating() {
    stopLoop();
    videoChamberAnimation(false, 66, 72);
    alpha -= delta;
    if (alpha <= 0.7) {
        cancelAnimationFrame(evacuating);
        simInstruction = "Select a sample to image."
        myInstructionA("acc-volt", simInstruction);
        chooseSample();
    }
    else {
        evac = requestAnimationFrame(evacuating);
    }
}

function videoChamberAnimation(exit, initIMG, topIMG) {
    vidChamberTimeout = setTimeout(function () {
        vidChamber = requestAnimationFrame(function () {
            videoChamberAnimation(exit, initIMG, topIMG);
        });
        counter++;
        if (counter == topIMG) {
            if (exit) {
                stopLoop();
                if (!samplePlaced) {
                    closeChamber();
                }
                else {
                    if (stageRotation) {
                        //                        askHTon();
                        selectVolt();
                    }
                    else {
                        counter = 66;
                        vidChamber = requestAnimationFrame(function () {
                            videoChamberAnimation(exit, 66, 72);
                        });
                        simInstruction = "Pump the air out from the chamber."
                        myInstructionA("btn-evacuate", simInstruction);
                    }
                }
            }
            else {
                counter = initIMG;
            }
        }
        else if (counter == 105) {
            counter = 72;
        }
    }, 1000 / 15);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = alpha;
    ctx.drawImage(sprite[counter], 0, 0, canvas.width, canvas.height);
};

function chooseSample() {
    toogle_fn(".top-btns", "totally-hidden", false);
    toogle_fn(".choose-sample", "totally-hidden", true);
}

function closeChamber() {
    $("#btn-chamber").html("CLOSE");
    simInstruction = "Close the chamber."
    myInstructionA("btn-chamber", simInstruction);
    samplePlaced = true;
}

function sampleChosen() {
    simInstruction = "Great so far."
        //    myInstructionA("btn-chamber", simInstruction);
}

function stopLoop() {
    clearTimeout(vidChamberTimeout);
    cancelAnimationFrame(vidChamber);
}

function loadChamberImages() {
    var IMGchamber;
    //    if (window.screen.width < 769) {
    //        if (isiPad) {
    //            IMGchamber = '@2xsmall.';
    //        } else {
    //            IMGchamber = '@small.';
    //        }
    //    } else if (window.devicePixelRatio > 1) {
    //        IMGchamber = '@2x.';
    //    } else {
    IMGchamber = '.';
    //    }
    for (var i = 0; i < 106; i++) {
        var theImage = document.createElement("img");
        theImage.setAttribute("id", "b" + i);
        theImage.setAttribute("src", "images/simulator/SEM/chamber/chamber_00" + i + IMGchamber + "jpg");
        theImage.setAttribute("style", "display:none");
        document.body.appendChild(theImage);
        // get images into array
        sprite[i - 1] = document.getElementById("b" + i);
    }
}
loadChamberImages();

function askHTon() {
    toogle_fn("#top-instructions", "top-instructions-on", true);
    setTimeout(function () {
        simInstruction = "Turn on the electron beam by selecting 'HT'"
        myInstructionB("ht-btn", simInstruction);
    }, 100);
}

function selectVolt() {
    toogle_fn("#top-instructions", "top-instructions-on", true);
    setTimeout(function () {
        simInstruction = "Set the accelerating voltage for the electron beam"
        myInstructionVolt(simInstruction);
    }, 100);
}

function otherSample() {
    $("#top-instructions-txt").html("Select a sample to image");
    toogle_fn("#top-instructions", "top-instructions-on", false);
    TweenLite.set(["#brightness", "#contrast", "#focus-c", "#focus-f", "#astigmatism-x", "#astigmatism-y"], {
        rotation: 140
    });
    TweenLite.set(["#magnification"], {
        rotation: 0
    });
    toogle_fn(".top-btns", "totally-hidden", false);
    toogle_fn(".choose-sample", "totally-hidden", true);
    var controls = ["btn-tvrate", "btn-scan1", "btn-scan2", "btn-save", "btn-print", "btn-se", "ht-btn", "brightness", "contrast", "magnification", "focus-c", "focus-f", "astigmatism-x", "astigmatism-y"];
    $.each(controls, function (index, val) {
        $('#' + val).removeClass("btn-active"); //remove the active
        $("#" + val).attr('disabled', true);
        $("#" + val).toggleClass(val + "-disabled");
        if ($("#" + val).hasClass("knob")) {
            $("#" + val).css('display', 'none');
            $("#" + val).parent().css("opacity", "0.6");
            $("#" + val).parent().css("cursor", "not-allowed");
        }
    });
    $("#acc-volt").slider("disable");
    $("#acc-volt").slider('value', '0');
    $("#acc-volt").addClass("acc-volt-disabled");
    $("#acc-volt").attr('disabled');
    $("#spot-size").slider("disable");
    $("#spot-size").slider('value', '0');
    $("#spot-size").addClass("spot-size-disabled");
    $("#spot-size").attr('disabled');
    $("#z-pos").slider("disable");
    $("#z-pos").slider('value', '0');
    $("#z-pos").addClass("z-pos-disabled");
    $("#z-pos").attr('disabled');
    toogle_fn(".ht-btn", "ht-btn-active", true);
    toogle_fn(".activeled", "activeled", true);
    volt_bool = false;
    brightnessIncrement = 0;
    brightNms = 0;
    brightnessValue = 0;
    contrastAmount = getRandomInt(5, 15) / 10;
    contrastIncrement = 0;
    spotSlider_blur = spot_valuesBlur[0];
    zBlur = z_values[0];
    astig_X = 0;
    astig_Y = 0;
    fineKnob = 0;
    coarseKnob = 0;
    astigm_blur = (getRandomInt(20, 50) / 10) * randomNegative;
    trim = 1.1;
    stretch = 1;
    fRate = 20;
    noise = "tv_rate";
    fromScanModes = false;
    lastScanUsed = "tv_rate";
    bse_switch = false;
    document.getElementById("btn-se").checked = false;
    document.getElementById("focus-blur").setStdDeviation(0, 0);
    canvas.style.filter = "url('#myblurfilter') contrast(1) brightness(1)";
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(sprite[counter], 0, 0, canvas.width, canvas.height);
    toogle_fn("#scalebar-div", "totally-hidden", false);
}
// ======================= ================START activate btns================= ======================== //
$('.btn-stay-pressed').click(function () {
    toogle_fn("#" + $(this).attr('id'), "btn-active", false);
});
$('#btn-reload').click(function () {
    location.reload();
    location.reload(true);
});
$('.btn-sample').click(function (e) {
    stopLoop();
    stageRotation = true;
    switch (e.target.id) {
    case "sample1":
        videoChamberAnimation(true, counter, 76);
        currentSEsample = SE_sample1;
        currentBSEsample = BSE_sample1;
        scaleBar_size = 5.4;
        scaleBar_unit = 20;
        break;
    case "sample2":
        videoChamberAnimation(true, counter, 88);
        currentSEsample = SE_sample2;
        currentBSEsample = BSE_sample2;
        scaleBar_size = 5.3;
        scaleBar_unit = 5;
        break;
    case "sample3":
        videoChamberAnimation(true, counter, 93);
        currentSEsample = SE_sample3;
        currentBSEsample = BSE_sample3;
        scaleBar_size = 4.1;
        scaleBar_unit = 10;
        break;
    case "sample4":
        videoChamberAnimation(true, counter, 99);
        currentSEsample = SE_sample4;
        currentBSEsample = BSE_sample4;
        scaleBar_size = 6.6;
        scaleBar_unit = 5;
        break;
    default:
        currentSEsample = SE_sample1;
        currentBSEsample = BSE_sample1;
    }
    toogle_fn(".top-btns", "totally-hidden", true);
    toogle_fn(".choose-sample", "totally-hidden", false);
    initSimulator();
});
// ======================= ================ END END activate btns================= ==================== //
// ======================= ================ END END CONTROLLING IT ================= ==================== //
// ======================= ================================= =============================== //
// ======================= =============START DRAWING IT================= ======================== //
function drawIt() {
    document.getElementById("scale-unit").innerHTML = scaleBar_unit + "&micro;m";
    document.getElementById("scalebar").style.width = (scaleBar_size * stretch) + "%";
    if (img_loaded) {
        // =================== this might go in initSimulator() =================== //
        bufferCanvas.width = canvas.width;
        bufferCanvas.height = canvas.height;
        bufferCanvasCtx.drawImage(image, (canvas.width - (canvas.width * stretch)) / 2, (canvas.height - (canvas.height * stretch)) / 2, canvas.width * stretch, canvas.height * stretch);
        // ======================= =================================//
        brightnessValue = brightNms + brightnessIncrement;
        contrastValue = contrastAmount - contrastIncrement;
        var slidersBlur = spotSlider_blur + zBlur;
        var blurIncrement = coarseKnob + fineKnob;
        if (astigm_blur > 0) {
            blurX = slidersBlur - (blurIncrement + astig_X);
            blurY = (slidersBlur + astigm_blur) - (blurIncrement + astig_Y);
        }
        else {
            blurX = (slidersBlur + (astigm_blur * (-1))) - (blurIncrement + astig_X);
            blurY = slidersBlur - (blurIncrement + astig_Y);
        }
        if (blurX < 0) blurX *= (-1);
        if (blurY < 0) blurY *= (-1);
        document.getElementById("focus-blur").setStdDeviation(blurX, blurY);
        canvas.style.filter = "url('#myblurfilter') contrast(" + contrastValue + ") brightness(" + brightnessValue + ")";
        // ======================= =================================//
        if (!fromScanModes) {
            ctx.drawImage(bufferCanvas, (canvas.width - (canvas.width * trim)) / 2, (canvas.height - (canvas.height * trim)) / 2, canvas.width * trim, canvas.height * trim);
            imgData_forScan = ctx.getImageData(0, 0, canvas.width, canvas.height);
        }
        else {
            bufferCanvasCtx.drawImage(bufferCanvas, (canvas.width - (canvas.width * trim)) / 2, (canvas.height - (canvas.height * trim)) / 2, canvas.width * trim, canvas.height * trim);
            imgData_forScan = bufferCanvasCtx.getImageData(0, 0, canvas.width, canvas.height);
        }
        // ======================= =================================//   
        switch (noise) {
        case "tv_rate":
            scanNoise(0.8, 1.5);
            scanNoise(0.4, 0.7);
            break;
        case "scan1":
            scanNoise(0.6, 1);
            break;
        }
    }
}

function scanNoise(factor1, factor2) {
    if (!fromScanModes) {
        imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    }
    else {
        imgData = imgData_forScan;
    }
    for (var i = 0; i < imgData.data.length; i += 4) {
        var randColor1 = factor1 + Math.random() * factor2;
        var randColor2 = factor1 + Math.random() * factor2;
        var randColor3 = factor1 + Math.random() * factor2;
        imgData.data[i] = imgData.data[i] * 1 * randColor1; // green
        imgData.data[i + 1] = imgData.data[i + 1] * 1 * randColor2; // green
        imgData.data[i + 2] = imgData.data[i + 2] * 1 * randColor3; // blue
        var grayscale = imgData.data[i] * p1 + imgData.data[i + 1] * p2 + imgData.data[i + 2] * p3;
        imgData.data[i] = grayscale + er; // red
        imgData.data[i + 1] = grayscale + eg; // green
        imgData.data[i + 2] = grayscale + eb; // blue
    }
    if (!fromScanModes) {
        ctx.putImageData(imgData, 0, 0);
    }
    else {
        imgData_forScan = imgData;
    }
};
// ==================== ================ END DRAWING IT END ================= ==================== 
// ======================= ================START FILTERS ================= ======================== //
//function setFilter(a, b, c) {}
// ======================= ================ END FILTERS END ================= ==================== //
// ======================= ================PRINT THE IMAGE================= =============================== //
var printTitle = "";

function printCanvas(el) {
    var dataUrl = canvas.toDataURL(); //attempt to save base64 string to server using this var  
    //    var dataUrl = document.getElementById(el).toDataURL(); //attempt to save base64 string to server using this var  
    var windowContent = '<!DOCTYPE html>';
    windowContent += '<html>'
    windowContent += '<head><title>' + printTitle + 'Image from the Virtual Instrument</title></head>';
    windowContent += '<body>'
    windowContent += '<img  style="width: 1024px;height: 726px;" src="' + dataUrl + '">';
    windowContent += '</body>';
    windowContent += '</html>';
    var printWin = window.open('', '', 'width=100,height=100,left=400');
    printWin.document.open();
    printWin.document.write(windowContent);
    printWin.document.close();
    printWin.focus();
    setTimeout(printMicrograph, 500);

    function printMicrograph() {
        printWin.print();
        printWin.close();
    }
}
// ======================= ================SAVE THE IMAGE================= =============================== //// snippet from:  http://stackoverflow.com/questions/18480474/how-to-save-an-image-from-canvas
function savePNG(canvastoPrint, filename) {
    /// create an "off-screen" anchor tag
    var lnk = document.createElement('a')
        , e;
    /// the key here is to set the download attribute of the a tag
    lnk.download = filename;
    /// convert canvastoPrint content to data-uri for link. When download
    /// attribute is set the content pointed to by link will be
    /// pushed as "download" in HTML5 capable browsers
    lnk.href = canvastoPrint.toDataURL();
    /// create a "fake" click-event to trigger the download
    if (document.createEvent) {
        e = document.createEvent("MouseEvents");
        e.initMouseEvent("click", true, true, window, 0, 0, 0, 0, 0, false, false, false, false, 0, null);
        lnk.dispatchEvent(e);
    }
    else if (lnk.fireEvent) {
        lnk.fireEvent("onclick");
    }
}
var dwn = document.getElementById('btn-save');
// Event handler for download
dwn.onclick = function () {
        var resizedCanvas = document.createElement("canvas");
        var resizedContext = resizedCanvas.getContext("2d");
        resizedCanvas.height = "726";
        resizedCanvas.width = "1024";
        resizedContext.drawImage(canvas, 0, 0, 1024, 726);
        savePNG(resizedCanvas, 'image_from training.png');
    }
    // ======================= ================END SAVE THE IMAGE END================= =============================== //
$("#close-example").click(function (e) {
    e.preventDefault();
    toogle_fn(".example-content", "totally-hidden", false);
});
$("#ok-keepWorking").click(function (e) {
    e.preventDefault();
    $("#top-instructions-txt").html("Click <a id='show-example' onclick='openExample()'>HERE</a> to see an example of an optimal micrograph.");
    toogle_fn("#top-instructions", "top-instructions-on", false);
    toogle_fn(".instructionsPanel", "totally-hidden", false);
    //    toogle_fn("#top-instructions", "top-instructions-on", true);
    toogle_fn("#scalebar-div", "totally-hidden", true);
});

function openExample() {
    toogle_fn(".example-content", "totally-hidden", true);
};
// ======================= ================START TOOGLE ================= ======================== //
function toogle_fn(element, className, bool) {
    if ($(element).hasClass(className) == bool) {
        $(element).toggleClass(className);
    }
}
// ======================= ================ END END TOOGLE================= ==================== //
function getRandomInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min)) + min; //The maximum is exclusive and the minimum is inclusive
}
window.onclick = function (event) {}
    //
    // ======================= ================START================= ======================== //
    // ======================= ================ END END ================= ==================== //