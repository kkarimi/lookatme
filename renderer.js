const bodyPix = require('@tensorflow-models/body-pix');
const { ipcRenderer } = require('electron');
require('@tensorflow/tfjs');

const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const nocamera = document.getElementById('nocamera');

const windowTopBar = document.createElement('div');
windowTopBar.className = 'windowTopBar';
windowTopBar.style.webkitAppRegion = 'drag';
document.body.appendChild(windowTopBar);

let selectedCamera = false;
let selectedFilter = false;
let selectedSize = 1;

let currentStream;

async function perform(net) {
  if (selectedFilter === 'blur' || selectedFilter === 'blurblur') {
    const segmentation = await net.segmentPerson(video);
    const backgroundBlurAmount = selectedFilter === 'blurblur' ? 10 : 5;
    const edgeBlurAmount = 4;
    const flipHorizontal = false;

    video.style.display = 'none';
    canvas.style.display = 'block';

    bodyPix.drawBokehEffect(
      canvas,
      video,
      segmentation,
      backgroundBlurAmount,
      edgeBlurAmount,
      flipHorizontal
    );
    requestAnimationFrame(()=>perform(net));
  } else if (selectedFilter === 'clip') {
    const segmentation = await net.segmentPerson(video);

    video.style.display = 'none';
    canvas.style.display = 'block';
    canvas.width = video.width;
    canvas.height = video.height;
    let context = canvas.getContext('2d');
    context.drawImage(video, 0, 0);
    let imageData = context.getImageData(0, 0, video.width, video.height);

    let pixel = imageData.data;
    for (let p = 0; p < pixel.length; p += 4) {
      if (segmentation.data[p / 4] == 0) {
        pixel[p + 3] = 0;
      }
    }
    context.imageSmoothingEnabled = true;
    context.filter = 'drop-shadow(0 0 20px rgba(0,0,0,0.25))';

    context.putImageData(imageData, 0, 0);
    context.drawImage(canvas, 0, 0);
    requestAnimationFrame(()=>perform(net));
  } else {
    video.style.display = 'block';
    canvas.style.display = 'none';
  }

  // setTimeout(() => perform(net), 50);

}

function loadBodyPix() {
  options = {
    multiplier: 0.75,
    stride: 32,
    quantBytes: 4,

    // outputStride: 16,
    // multiplier: 1,
    // quantBytes: 2
  };
  bodyPix
    .load(options)
    .then((net) => perform(net))
    .catch((err) => console.log(err));
}

function stopMediaTracks(stream) {
  stream.getTracks().forEach((track) => {
    track.stop();
  });
}

const setSize = () => {
  let ar = video.videoHeight / video.videoWidth;
  let baseSize = selectedSize * 640;
  video.width = canvas.width = video.videoWidth;
  video.height = canvas.height = video.videoHeight;

  canvas.style.width = baseSize + 'px';
  canvas.style.height = ar * baseSize + 'px';
  video.style.width = baseSize + 'px';
  video.style.height = ar * baseSize + 'px';
  ipcRenderer.send(
    'set-size',
    JSON.stringify({
      selectedSize: selectedSize,
      width: baseSize,
      height: ar * baseSize,
    })
  );
};

const setActiveCamera = (deviceId) => {
  if (typeof currentStream !== 'undefined') {
    stopMediaTracks(currentStream);
  }
  const videoConstraints = {};
  if (deviceId === '') {
    videoConstraints.facingMode = 'environment';
  } else {
    videoConstraints.deviceId = { exact: deviceId };
  }
  selectedCamera = deviceId;

  const constraints = {
    video: videoConstraints,
    audio: false,
  };
  navigator.mediaDevices
    .getUserMedia(constraints)
    .then((stream) => {
      currentStream = stream;
      video.srcObject = stream;
      video.addEventListener('loadeddata', (event) => {
        loadBodyPix();
        setSize();
      });
      nocamera.style.display = 'none';
      return navigator.mediaDevices.enumerateDevices();
    })
    // .then(gotDevices)
    .catch((error) => {
      nocamera.style.display = 'block';
      console.error(error);
    });
  ipcRenderer.send(
    'update-settings',
    JSON.stringify({
      selectedSize: selectedSize,
      selectedCamera: selectedCamera,
      selectedFilter: selectedFilter,
    })
  );
};

function gotDevices(mediaDevices) {
  let videoDevices = mediaDevices.filter((vd) => vd.kind === 'videoinput');
  ipcRenderer.send('camera-list', JSON.stringify(videoDevices)); // send request

  if (videoDevices.length === 0) {
    // no devices
    nocamera.style.display = 'block';
  }
  if (videoDevices.length === 1) {
    nocamera.style.display = 'none';
  }
  if (videoDevices.length){
    setActiveCamera(videoDevices[0].deviceId);
  }
}

ipcRenderer.on('set-filter', function (event, newFilter) {
  selectedFilter = newFilter;
});

ipcRenderer.on('set-size', function (event, newSize) {
  selectedSize = newSize;
  setSize();
});

ipcRenderer.on('set-camera', function (event, deviceId) {
  setActiveCamera(deviceId);
});

navigator.mediaDevices.enumerateDevices().then(gotDevices);
