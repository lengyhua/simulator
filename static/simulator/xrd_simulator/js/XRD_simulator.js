/* XRD_simulator javascript functions    

Created  by Andres Vasquez for AMMRF'S www.myscope.training
—— www.andresvasquez.net ——
copyright:This work is licensed under a Creative Commons Attribution 4.0 International License.

************************************************************************/
var svg_curve = document.getElementById('svg-curve');
var canvas = document.getElementById('canvas-curve');
var ctx = canvas.getContext('2d');

//var bufferC_XRD_01 = document.createElement("canvas");
//var bufferCtx_XRD_01 = bufferC_XRD_01.getContext("2d");

var chosen_specimen;
var promise_fullfilled_num = 0;
var promises_total = 8;
var sprites = [];
var power_timer;
var scan_timer;
var power_val = 10;
var start_angle = 5;
var end_angle = 80;
var step_arr_pos = 0;
var step_val = 0;
var steptime_arr_pos = 0;
var steptime_val = 0;
var steps_num = 0;
var scan_time = 0;
var scan_angle = 0;
var increment_angle = 0;
var start_arr_pos = 0;
var end_arr_pos = 0;
var drawFPS = 1000;
var switch_angle_a = true;
var switch_angle_b = true;
var switch_step_size = true;
var switch_step_time = true;
var bool_first_time = true;

canvas.width = 740;
canvas.height = 570;




// ======================= START ======================== //
const specimen_reset_fn = () => {
    steptime_val = 0;
    $("#start-angle-line").css("opacity", "0");
    $("#end-angle-group").css("opacity", "0");
    $("#scantime-label").toggleClass("label-disabled", true);
    $("#scantime-div").toggleClass("div-disabled", true);
    $("#scantime-val").html('—');
    //    deactivate_round_btn("#btn-standby", "#standby-label");
    //    $("#btn-standby").toggleClass("green-halo", false);
    //    deactivate_sqr_btn("#btn-power", "off", "#power-label");
    //    $("#stats-kv").toggleClass("div-disabled", true);
    //    $("#stats-ma").toggleClass("div-disabled", true);
    //    power_val = 10;
    //    $("#kv-val").html(power_val);
    //    $("#ma-val").html(power_val);
    deactivate_angles("#stats-start button", "#start-div");
    deactivate_angles("#stats-end button", "#end-div");
    $('#step').val('empty');
    $("#step").selectmenu("refresh");
    step_val = 0;
    deactivate_dd("#step");
    $('#time-step').val('empty');
    $("#time-step").selectmenu("refresh");
    steptime_arr_pos = 0;
    deactivate_dd("#time-step");
    deactivate_sqr_btn("#btn-save-dff");
    deactivate_sqr_btn("#btn-start-scan");
    XRD_step_num = 2;
    switch_angle_a = true;
    switch_angle_b = true;
    switch_step_size = true;
    switch_step_time = true;
}
// ======================= END ======================== //
// ======================= START DARK-THEME RECOLOR ======================== //
/*
 * XRD_radiometer_1.js 注入的仪器插画是为浅色背景设计的（白色满屏底 + 深灰仪器）。
 * 深色主题下做语义级映射：场景（底/墙/地板）变暗，仪器主体变亮，
 * X 射线光束、指示灯、红点等强调色保留原样。
 * #FFFFFF 作为 fill（背景矩形）变暗、作为 stop-color（高光）变亮，故按属性分开建表。
 */
const DIAGRAM_FILL_DARK_MAP = {
    // 场景：原浅色 → 深色
    '#FFFFFF': '#1E2028', // 满屏背景矩形
    '#BFBAB8': '#2E3242', '#E6E6E5': '#3A3F5C', // 墙
    '#A1A4A1': '#343848', '#4E534B': '#1B1E29', // 地板
    '#3E3D3C': '#232636',
    // 仪器主体：原深灰 → 亮灰
    '#595956': '#8B93A8', '#73736F': '#6E7490', '#323132': '#565B6E',
    '#353434': '#585D70', '#504140': '#7A6E74', '#675B5F': '#8A7E84',
    '#3A3530': '#5E564F', '#39291C': '#6B5A4C', '#1C1612': '#4A4238',
    '#000000': '#4A5064', '#121228': '#121228',
    // 浅色部件/高光 → 冷色浅灰
    '#EAEAE7': '#C9CEDD', '#EAEAE6': '#C9CEDD', '#F3F3F3': '#E6E8F0',
    '#B9B9B4': '#AEB4C6', '#B9B6B6': '#AEB4C6', '#BDBDB5': '#B4BACB',
    '#D0D0D0': '#C0C6D8', '#999999': '#9BA3C2', '#A0A19D': '#A6ADC2',
    '#95958F': '#9BA3C2', '#AEAEA6': '#B4BACB'
    // 保留不动：#E3E995(X射线光束) #FF0000(红点) #8D7F7E(红点余烬态) #95D4E9(蓝色部件)
};
const DIAGRAM_STROKE_DARK_MAP = {
    '#979797': '#5A6178', '#777776': '#5A6178', '#787A79': '#5A6178',
    '#73736F': '#5A6178', '#7C7A7A': '#5A6178', '#6E6E6C': '#5A6178',
    '#676766': '#5A6178', '#4D4C49': '#5A6178', '#444143': '#5A6178',
    '#515151': '#5A6178', '#656562': '#5A6178', '#707070': '#5A6178',
    '#595956': '#8B93A8', '#FFFFFF': '#C9CEDD', '#FFFCFD': '#C9CEDD'
    // 保留不动：#FFBE00(琥珀指示灯) #FF0000 #FF000080
};
const DIAGRAM_STOP_DARK_MAP = {
    // 墙/地板
    '#BFBAB8': '#2E3242', '#E6E6E5': '#3A3F5C',
    '#A1A4A1': '#343848', '#4E534B': '#1B1E29', '#3E3D3C': '#232636',
    // 中灰渐变 → 板岩灰
    '#959595': '#5E6478', '#B9AFB7': '#8E93AC', '#A4A49D': '#767C92',
    '#BFBFBF': '#AAB2C5', '#8C8C8C': '#6E7490', '#D7D7D7': '#C0C6D8',
    '#AAAAA1': '#8B93A8', '#D7D6D6': '#C0C6D8', '#B6B6AF': '#9BA3C2',
    '#DBDBDB': '#C9CEDD', '#656260': '#7E8496', '#383436': '#4E5266',
    '#716F67': '#8A8F9C', '#9E9E9D': '#7E8496', '#9C9C9C': '#7A8093',
    '#C8C8C5': '#AAB2C5', '#D3D0C7': '#B4BACB', '#B4B4B2': '#9BA3C2',
    '#9E9A87': '#8E8A7E', '#878784': '#7E8496', '#88888B': '#7E8290',
    '#ADAEB2': '#9BA3C2', '#3D3B33': '#4A463C', '#6C6C64': '#7E8496',
    '#F2ECEC': '#E6E8F0', '#68686A': '#7E8290', '#6B6C6F': '#848AA0',
    '#666666': '#7E8496', '#8A8A8A': '#9BA3C2', '#585858': '#6E7490',
    '#6D6D6D': '#848AA0', '#4F4F4F': '#666C82', '#333333': '#333849',
    '#151515': '#12141C', '#C3C3C3': '#9BA3C2', '#545454': '#6A6F88',
    // 米/棕渐变 → 灰暖调
    '#5A5652': '#6E6880', '#C7C1B3': '#A6A2B8', '#C5C5BB': '#A4A4B4',
    '#AD9E8D': '#8E8478', '#C8C2B8': '#A8A4B0', '#BFB5A0': '#A29A88',
    '#949388': '#84898F', '#70706A': '#5E5A66', '#48433B': '#4E483C',
    '#463F36': '#4A4438', '#4C4840': '#504A40', '#545241': '#565242',
    '#706C64': '#6E6A60', '#BBA695': '#A89E96', '#886F5D': '#7E6A5E',
    '#B8BAAB': '#A8AAB0', '#CFD4C4': '#BEC2CE',
    // 白/亮渐变 → 冷白
    '#FFFFFF': '#E6E8F0', '#F0F0F0': '#D8DCE8', '#E4E4E4': '#C9CEDD',
    '#BEBEBE': '#AAB2C5', '#F3F1EA': '#DEDCD2', '#D2D2D2': '#C0C6D8',
    '#F6F6F5': '#E2E4EC', '#F4F4F2': '#DEDFDC', '#B6B6AE': '#A6A6AE',
    '#F0F0EE': '#D8DAD8', '#EAEAE7': '#CACBD2', '#F8F5F3': '#E8E6F0',
    '#A6A19B': '#9A96A0', '#F6F4F1': '#E4E2EC', '#EAE7DF': '#D2D0D8',
    '#FFFDFC': '#F0EFF5'
};
const recolorDiagramForDark = () => {
    const maps = {
        'fill': DIAGRAM_FILL_DARK_MAP,
        'stroke': DIAGRAM_STROKE_DARK_MAP,
        'stop-color': DIAGRAM_STOP_DARK_MAP
    };
    const svg = document.getElementById('svg-diagram');
    if (!svg) return;
    svg.querySelectorAll('*').forEach(el => {
        for (const attr in maps) {
            const cur = el.getAttribute(attr);
            if (!cur) continue;
            const target = maps[attr][cur.trim().toUpperCase()];
            if (target) el.setAttribute(attr, target);
        }
    });
};
// =======================  END DARK-THEME RECOLOR  ==================== //
// ======================= START ======================== //
for (let i = 0; i <= promises_total + 1; i++) {
    sprites[i] = new Array();
}

const do_when_done = (max, str_id, images_arr) => {
    for (let i = 1; i <= max; i++) {
        images_arr[i - 1] = document.getElementById(`${str_id}_${i}`);
    }
    promise_fullfilled_num++;
    switch (promise_fullfilled_num) {
        case 1:
            i_promise_file(1, `js/XRD_cartesian_plane_`, `js_script`, sprites[promise_fullfilled_num], `js`);
            $("#svg-diagram").html(svg_radiometer);
            recolorDiagramForDark();
            break;
        case 2:
            $("#loading-modal").toggleClass("totally-hidden", true);
            $("#top-bar").toggleClass("modal-is-open", false);
            $("#simulator-base").toggleClass("modal-is-open", false);
            $("#svg-curve").html(cartesian_axis);
            console.log("sigue prometiendo");
            break;
    }
}

// ======================= START ======================== //
const i_promise_file = (max, path_str, id_str, arr, extension) => {
    let data_promises = [];
    for (let i = 1; i <= max; i++) {
        var promise = Loader.js(`${path_str}${i}.${extension}`, `${id_str}_${i}`);
        data_promises.push(promise);
    }
    Promise.all(data_promises).then(messages => {
        do_when_done(max, id_str, arr);
    }).catch(error => {
        console.error("Rejected!", error);
    });
}
// =======================  END END  ==================== //
i_promise_file(1, `js/XRD_radiometer_`, `js_script`, sprites[promise_fullfilled_num], `js`);
// =======================  END END  ==================== //
// ======================= START INSTRUCTIONS ======================== //
const display_instruction = () => {
    //    instruct_text = XRD_step_num + '. ' + eval('instruction_step_' + XRD_step_num);
    instruct_text = eval('instruction_step_' + XRD_step_num);
    $("#top-instructions-txt").fadeTo(100, 0, function () {
        $("#top-instructions-txt").html(instruct_text);
        $("#top-instructions-txt").fadeTo(1000, 1);
    });

};
// =======================  END END  ==================== //


// =======================  JQUERYUI  ==================== //
$(function () {
    // ======================= START DROP DOWN ======================== //

    $("#specimen").selectmenu({
        select: function (event, data) {
            deactivate_sqr_btn("#btn-save-dff");
            $("#svg-curve").html(cartesian_axis);
            chosen_specimen = parseInt(data.item.value);
            ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
            XRD_step_num = 2;
            XRD_step_2();
        },
        //        disabled: true
    });
    $("#step").selectmenu({
        select: function (event, data) {
            step_arr_pos = parseInt(data.item.value);
            switch (step_arr_pos) {
                case 1:
                    step_val = 0.005;
                    break;
                case 9:
                    step_val = 0.01;
                    break;
                case 15:
                    step_val = 0.02;
                    break;
            }
            scan_time_fun();
            XRD_step_num = 6;
            if (switch_step_size) next_step();
            switch_step_size = false;
            switch_angle_a = false;
            switch_angle_b = false;
        },
        disabled: true
    });
    $("#time-step").selectmenu({
        select: function (event, data) {
            steptime_arr_pos = parseInt(data.item.value);
            switch (steptime_arr_pos) {
                case 0:
                    steptime_val = 0.2;
                    break;
                case 2:
                    steptime_val = 0.04;
                    break;
                case 1:
                    steptime_val = 0.08;
                    break;
            }
            scan_time_fun();
            activate_sqr_btn("#btn-start-scan");
            XRD_step_num = 7;
            if (switch_step_time) next_step();
            switch_step_time = false;
            switch_angle_a = false;
            switch_angle_b = false;
        },
        disabled: true
    });

    // =======================  END END DROP DOWN  ==================== //
});
// ======================= END ======================== //


var activate_sqr_btn = (dom_name, label_name) => {
    $(dom_name).toggleClass("btn-disabled", false);
    $(dom_name).prop('disabled', false);
    $(dom_name).css("cursor", "pointer");
    $(label_name).toggleClass("label-disabled", false);
}

var deactivate_sqr_btn = (dom_name, on_off = "off", label_name) => {
    $(dom_name).toggleClass("btn-disabled", true);
    $(dom_name).toggleClass("btn-active", false);
    $(dom_name).prop('disabled', true);
    $(dom_name).prop('value', on_off);
    $(label_name).toggleClass("label-disabled", true);
}

var deactivate_round_btn = (dom_name, label_name) => {
    $(dom_name).toggleClass("btn-disabled", true);
    $(dom_name).toggleClass("round-btn-active", false);
    $(dom_name).prop('disabled', true);
    $(dom_name).prop('value', "off");
    $(label_name).toggleClass("label-disabled", true);
}

var activate_angles = (dom_name, div_name) => {
    $(dom_name).prop('disabled', false);
    $(dom_name).toggleClass("btn-disabled", false);
    $(div_name).toggleClass("div-disabled", false);
}

var deactivate_angles = (dom_name, div_name) => {
    $(dom_name).prop('disabled', true);
    $(dom_name).toggleClass("btn-disabled", true);
    $(div_name).toggleClass("div-disabled", true);
}

var deactivate_slider = (dom_name) => {
    $(dom_name).slider("disable");
    $(dom_name + "-label").toggleClass("label-disabled", true);
}

var activate_dd = (dom_name) => {
    $(dom_name).selectmenu("enable");
    $(dom_name + "-label").toggleClass("label-disabled", false);
}

var deactivate_dd = (dom_name) => {
    $(dom_name).selectmenu("disable");
    $(dom_name + "-label").toggleClass("label-disabled", true);
}

// ======================= START ======================== //
// ======================= END ======================== //
$('.btn').click(function (e) {
    if (e.target.value == "off") {
        e.target.value = "on";
        $("#" + e.target.id).toggleClass("btn-active", true);
    } else {
        e.target.value = "off";
        $("#" + e.target.id).toggleClass("btn-active", false);
    }
    e.target.disabled = true;
    $("#" + e.target.id).css("cursor", "not-allowed");
    switch (e.target.id) {
        case "btn-doors":
            if (e.target.value == "off") {
                $("#btn-doors").html("开门");
                close_doors_fn();
            } else {
                $("#btn-doors").html("关门");
                doors_fn();
            }
            break;
        case "btn-start-scan":
            deactivate_sqr_btn("#btn-save-dff");
            $("#top-instructions-txt").html("");
            if (e.target.value == "on") {
                $("#svg-curve").html(cartesian_axis);
                $(this).html("扫描中…");
                $("#btn-shutter").toggleClass("shutter-active", true);
                $("#x-ray-in").toggleClass("ray-r", true);
                $("#svg-diagram line#ray-l").css("opacity", "1");
                $("#btn-shutter").html("打开");
                let y_child = (chosen_specimen * 3) + (steptime_arr_pos + 1);
                // guard: if the specimen / rate were never selected this becomes NaN and
                // "#y_axis g:nth-of-type(NaN)" is an invalid selector that makes jQuery
                // throw, aborting the rest of this block (ticks stayed hidden).
                if (Number.isFinite(y_child)) {
                    $(`#y_axis g:nth-of-type(${y_child})`).toggleClass("y-visible", true);
                    $(`#y_axis g:nth-of-type(${y_child})`).toggleClass("y-group", false);
                }
                $("#degree-l text").toggleClass("y-visible", true);
                $("#degree-r text").toggleClass("y-visible", true);
                $("#degree-l text").html(`${start_angle}&#176;`);
                $("#degree-r text").html(`${end_angle}&#176;`);
                eraseInvisibleY();
            }
            scan_angle = 0;
            increment_angle = 0;
            scan_timer = setInterval(scan_anim_fun, 50);
            start_arr_pos = get_arr_start_fun();
            end_arr_pos = get_arr_end_fun();
            incremented_end_arr_pos = start_arr_pos;
            drawCurve_timer = setInterval(increment_curve_fun, 1000 / drawFPS);
            break;
        case "btn-save-dff":
            export_StyledSVG(svg_curve);
            deactivate_sqr_btn("#btn-save-dff");
            break;
        default:
            //        code block
    }
});
// ======================= END ======================== //
// ======================= END ======================== //
$('#btn-standby').click(function (e) {
    bool_first_time = false;
    if (e.target.value == "off") {
        e.target.value = "on";
        $("#" + e.target.id).toggleClass("round-btn-active", true);
    } else {
        e.target.value = "off";
        $("#" + e.target.id).toggleClass("round-btn-active", false);
    }
    e.target.disabled = true;
    $("#" + e.target.id).css("cursor", "not-allowed");
    $("#stats-kv").toggleClass("div-disabled", false);
    $("#stats-ma").toggleClass("div-disabled", false);
    $(this).toggleClass("blinker", true);
    power_timer = setInterval(increasePower_fn, 400);
});
// ======================= END ======================== //

// ======================= START ======================== //
const doors_fn = () => {
    let open_doors = anime.timeline({
        easing: 'linear',
        duration: 1000,
    });

    open_doors
        .add({
            targets: '#svg-diagram g#xrd-specimen',
            translateY: "40vw",
            scale: 2.5,
            complete: function (anim) {}
        }, '-=1000')
        .add({
            targets: '#svg-diagram g#door-l',
            translateX: "-120vw"
        })
        .add({
            targets: '#svg-diagram g#door-r',
            translateX: "120vw",
            complete: function (anim) {
                $("#svg-diagram g#xrd-specimen").css("opacity", "1");
                specimen_fn();
            }
        }, '-=1000');
}

// ======================= END ======================== //
// ======================= START ======================== //
const specimen_fn = () => {
    anime({
        targets: '#svg-diagram g#xrd-specimen',
        translateY: {
            value: "0vw",
            duration: 1000,
            easing: 'linear'
        },
        scale: {
            value: 1,
            duration: 1000,
            easing: 'linear'
        },
        complete: function (anim) {
            $("#svg-diagram g#xrd-specimen").css("filter", "none");
            next_step();
        }
    });
}

// ======================= END ======================== //
// ======================= START ======================== //
const close_doors_fn = () => {
    let close_doors = anime.timeline({
        easing: 'linear',
        duration: 1000,
    });

    close_doors
        .add({
            targets: '#svg-diagram g#door-l',
            translateX: "0vw"
        })
        .add({
            targets: '#svg-diagram g#door-r',
            translateX: "0vw",
            complete: function (anim) {
                if (!bool_first_time) XRD_step_num = 5;
                next_step();
            }
        }, '-=1000');
}

// ======================= END ======================== //

// ======================= START ======================== //
const increasePower_fn = () => {
    power_val += 5;
    if (power_val <= 45) {
        $("#kv-val").html(power_val);
    } else if (power_val <= 80) {
        $("#ma-val").html(power_val - 40);
    } else {
        clearInterval(power_timer);
        $("#btn-standby").toggleClass("blinker", false);
        $("#btn-standby").toggleClass("green-halo", true);
        activate_sqr_btn("#btn-power", "#power-label");
        $("#btn-power").trigger("click");
        $("#btn-power").html("开");
        next_step();
    }

}
// ======================= END ======================== //
// ======================= START ======================== //
$('#btn-start-dw').click(function (e) {
    if (start_angle > 5) {
        $(this).css("cursor", "pointer");
        start_angle -= 5;
        set_angles_fun();
    } else {
        $(this).css("cursor", "not-allowed");
    }
    $("#start-txt").html(`${start_angle}&#176;`);
    XRD_step_num = 5;
    if (switch_angle_a) next_step();
    switch_angle_a = false;
})

$('#btn-start-up').click(function (e) {
    if (start_angle < 105 && start_angle < (end_angle - 5)) {
        $(this).css("cursor", "pointer");
        start_angle += 5;
        set_angles_fun();
    } else {
        $(this).css("cursor", "not-allowed");
    }
    $("#start-txt").html(`${start_angle}&#176;`);
    XRD_step_num = 5;
    if (switch_angle_a) next_step();
    switch_angle_a = false;
})

$('#btn-start-dw').hover(function () {
    if (start_angle == 5) {
        $(this).css("cursor", "not-allowed");
    } else {
        $(this).css("cursor", "pointer");
    }
})

$('#btn-start-up').hover(function () {
    if (start_angle <= 105 && start_angle < (end_angle - 5)) {
        $(this).css("cursor", "pointer");
    } else {
        $(this).css("cursor", "not-allowed");
    }
})

$('#btn-end-dw').click(function (e) {
    //    switch_step_size = false;
    if (end_angle > 10 && end_angle > (start_angle + 5)) {
        $(this).css("cursor", "pointer");
        end_angle -= 5;
        set_angles_fun();
    } else {
        $(this).css("cursor", "not-allowed");
    }
    $("#end-txt").html(`${end_angle}&#176;`);
    XRD_step_num = 5;
    if (switch_angle_b) next_step();
    switch_angle_b = false;
    switch_angle_a = false;
})

$('#btn-end-up').click(function (e) {
    if (end_angle < 110) {
        $(this).css("cursor", "pointer");
        end_angle += 5;
        set_angles_fun();
    } else {
        $(this).css("cursor", "not-allowed");
    }
    $("#end-txt").html(`${end_angle}&#176;`);
    XRD_step_num = 5;
    if (switch_angle_b) next_step();
    switch_angle_b = false;
    switch_angle_a = false;
})

$('#btn-end-dw').hover(function (e) {
    if (end_angle > 10 && end_angle > (start_angle + 5)) {
        $(this).css("cursor", "pointer");
    } else {
        $(this).css("cursor", "not-allowed");
    }
})

$('#btn-end-up').hover(function (e) {
    if (end_angle == 110) {
        $(this).css("cursor", "not-allowed");
    } else {
        $(this).css("cursor", "pointer");
    }
})


const set_angles_fun = (start_angl = start_angle, end_angl = end_angle) => {
    let new_start = scroll_equation(start_angl, 5, 105, 0, -52.5);
    let angle_device_l = scroll_equation(start_angl, 5, 105, 5, 57.5);
    let angle_device_r = scroll_equation(start_angl, 5, 105, -5, -57.5);
    let new_end = scroll_equation(end_angl, 110, 10, 0, 52.5);
    $("#start-angle-line").css("transform", `rotate(${new_start}deg)`);
    $("#start-mask").css("transform", `rotate(${new_start-new_end}deg)`);
    $("#end-angle-group").css("transform", `rotate(${new_end}deg)`);
    // keep the readout on the diagram in sync with the configured range
    const range_txt = `2θ 范围：${start_angle}&#176; – ${end_angle}&#176;`;
    if ($("#range-2theta").html() !== range_txt) {
        $("#range-2theta").html(range_txt);
    }
    $("#detector-l").css("transform", `translate(-2.2vw, -2.3vw) rotate(${angle_device_l}deg)`);
    $("#detector-r").css("transform", `translate(-4.4vw, -4.4vw) rotate(${angle_device_r}deg)`);
    //    console.log({
    //        new_start
    //    }, {
    //        new_end
    //    });
    scan_time_fun();
}
// ======================= END ======================== //

// ======================= START ======================== //
var drawCurve_timer;
var incremented_end_arr_pos = 0;
const increment_curve_fun = () => {
    incremented_end_arr_pos += 4;
    if (incremented_end_arr_pos <= end_arr_pos) {
        drawCurve();
    } else {
        clearInterval(drawCurve_timer);
        XRD_step_num = 8;
        next_step();
    }
}
// ======================= END ======================== //

// ======================= START ======================== //
const scan_time_fun = () => {
    scan_time = (end_angle - start_angle) / steptime_val;
    (steptime_val != 0) ? $("#scantime-val").html(scan_time + " 秒"): $("#scantime-val").html('—');
}
// ======================= END ======================== //

const scan_back_fun = () => {
    $("#btn-shutter").toggleClass("shutter-active", false);
    $("#x-ray-in").toggleClass("ray-r", false);
    $("#svg-diagram line#ray-l").css("opacity", "0");
    $("#btn-shutter").html("关闭");
    $("#btn-start-scan").html("开始扫描");
    deactivate_sqr_btn("#btn-start-scan");
    if (scan_angle > start_angle) {
        increment_angle--;
        scan_angle = start_angle + increment_angle;
        set_angles_fun(scan_angle);
    } else {
        clearInterval(scan_timer);
        activate_sqr_btn("#btn-start-scan");
        activate_sqr_btn("#btn-save-dff");
        activate_dd("#specimen");
    }

}
const scan_anim_fun = () => {
    $("#svg-diagram #red-spot").css("fill", "#FF0000");
    if (scan_angle < end_angle) {
        increment_angle++;
        scan_angle = start_angle + increment_angle;
        set_angles_fun(scan_angle);
    } else {
        clearInterval(scan_timer);
        scan_timer = setInterval(scan_back_fun, 10);
        $("#svg-diagram #red-spot").css("fill", "#8D7F7E");
    }
}
// ======================= START ======================== //

const get_arr_start_fun = () => {
    let from_angle;
    for (let i = 0; i < x_data.length; i++) {
        if (x_data[i] > start_angle) {
            from_angle = i;
            return from_angle;
        }
    }
}

const get_arr_end_fun = () => {
    let to_angle;
    for (let i = (x_data.length) - 1; i > 0; i--) {
        if (x_data[i] < end_angle) {
            to_angle = i;
            return to_angle;
        }
    }
}
// ======================= END ======================== //
// ======================= START ======================== //

function drawCurve() {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    //    ctx.lineWidth = 10;
    ctx.strokeStyle = '#1f77b4';
    ctx.beginPath();
    let start_y = scroll_equation(y_data[chosen_specimen][0][steptime_arr_pos], y_min[chosen_specimen][steptime_arr_pos], y_max[chosen_specimen][steptime_arr_pos], y_axis_h, 0);
    let start_x = scroll_equation(x_data[start_arr_pos], start_angle, end_angle, 0, x_axis_w);
    ctx.moveTo(start_x, start_y);
    for (var i = 1; i < incremented_end_arr_pos; i++) {
        let current_y = scroll_equation(y_data[chosen_specimen][i][steptime_arr_pos], y_min[chosen_specimen][steptime_arr_pos], y_max[chosen_specimen][steptime_arr_pos], y_axis_h, 0);
        let current_x = scroll_equation(x_data[i], start_angle, end_angle, 0, x_axis_w);
        ctx.lineTo(current_x, current_y);
    }
    ctx.stroke();
}
// ======================= END ======================== //


// ======================= START DRGGABLE MODALS ======================== //
$("#tem-diagram-modal").draggable();
// ======================= END  ======================== //
// ======================= START ======================== //


$("#close-tem-diagram").click(function (e) {
    e.preventDefault();
    $("#tem-diagram-modal").toggleClass("totally-hidden", true);
    deactivate_sqr_btn("#btn-diagram-tem");
    activate_sqr_btn("#btn-diagram-tem");
});

// =======================  END END  ==================== //
// ======================= START ======================== //


$("#close-save").click(function (e) {
    e.preventDefault();
    $("#save-modal-window").toggleClass("totally-hidden", true);
});

// =======================  END END  ==================== //

// =======================  END END  ==================== //
$("#close-resize").click(() => {
    toogle_fn("#modal-resize", "totally-hidden", false);
});
// ======================= START ======================== //

// ======================= START ======================== //
var svg_w = 1010;
var svg_h = 550;
var canv_w = 892;
var canv_h = 478;

function saveXRDIMG(the_svg) {
    var resizedCanvas = document.createElement("canvas");
    var resizedContext = resizedCanvas.getContext("2d");
    resizedCanvas.width = svg_w;
    resizedCanvas.height = svg_h;
    resizedContext.fillStyle = "white";
    resizedContext.fillRect(0, 0, svg_w, svg_h);
    resizedContext.drawImage(the_svg, 0, 0, 835, 655, 0, 0, svg_w, svg_h);
    resizedContext.drawImage(canvas, 88, 20, canv_w, canv_h);

    /// create an "off-screen" anchor tag
    var lnk = document.createElement('a'),
        e;
    /// the key here is to set the download attribute of the a tag
    let specimen_title = $(`#specimen option[value=${chosen_specimen}]`).text();
    lnk.download = `${specimen_title}的衍射图谱.jpg`;
    /// convert canvastoPrint content to data-uri for link. When download
    /// attribute is set the content pointed to by link will be
    /// pushed as "download" in HTML5 capable browsers
    lnk.href = resizedCanvas.toDataURL();
    /// create a "fake" click-event to trigger the download
    if (document.createEvent) {
        e = document.createEvent("MouseEvents");
        e.initMouseEvent("click", true, true, window, 0, 0, 0, 0, 0, false, false, false, false, 0, null);
        lnk.dispatchEvent(e);
    } else if (lnk.fireEvent) {
        lnk.fireEvent("onclick");
    }
}
// ======================= END ======================== //
// ======================= START ======================== //
var ContainerElements = ["svg", "g"];
var RelevantStyles = {
    "svg": ["width", "height"],
    "g": ["font-size", "font-family", "font-weight", "opacity"],
    "text": ["fill", "font-size", "font-family", "font-weight", "transform"],
    "text#y-label": ["transform"],
    "line": ["stroke", "stroke-width"],
    ".y-group": ["opacity"],
    "g.y-group.y-visible": ["opacity"]
};


function read_Element(ParentNode, OrigData) {
    var Children = ParentNode.childNodes;
    var OrigChildDat = OrigData.childNodes;

    for (var cd = 0; cd < Children.length; cd++) {
        var Child = Children[cd];

        var TagName = Child.tagName;
        if (ContainerElements.indexOf(TagName) != -1) {
            read_Element(Child, OrigChildDat[cd])
        } else if (TagName in RelevantStyles) {
            var StyleDef = window.getComputedStyle(OrigChildDat[cd]);

            var StyleString = "";
            for (var st = 0; st < RelevantStyles[TagName].length; st++) {
                StyleString += RelevantStyles[TagName][st] + ":" + StyleDef.getPropertyValue(RelevantStyles[TagName][st]) + "; ";
            }

            Child.setAttribute("style", StyleString);
        }
    }

}

function eraseInvisibleY() {
    document.querySelectorAll('.y-group').forEach(function (a) {
        a.remove()
    })
}

function export_StyledSVG(SVGElem) {
    $("#svg-curve").attr("width", "835");
    $("#svg-curve").attr("height", "655");
    var oDOM = SVGElem.cloneNode(true);
    oDOM.id = "svg-copy"
    read_Element(oDOM, SVGElem);
    var data = new XMLSerializer().serializeToString(oDOM);
    var svg = "data:image/svg+xml," + data;

    let img_svg = new Image();
    img_svg.onload = function () {
        img_svg.width = svg_w;
        img_svg.height = svg_h;
        saveXRDIMG(img_svg)
    }
    img_svg.src = svg;
}
// ======================= END ======================== //
