import Crunker from 'https://unpkg.com/crunker@latest/dist/crunker.esm.js'
import sounds from './files.json' assert {type: 'json'}

const sampleRate = 48000
const crunker = new Crunker({ sampleRate })

const downloadButton = document.getElementById('download-button')
const playButton = document.getElementById('play-button')
const recordButton = document.getElementById('record-button')
const recordingDurationText = document.getElementById('recording-duration')
let recordingDuration = 0
let recordingInterval
let recording = false
let sound
let soundEl = document.querySelector('.sound-effect.selected')

fetch(`audio/${sounds[soundEl.dataset.sound]}`).then(async res => sound = await res.blob())

document.querySelectorAll('.sound-effect').forEach(se => {
  se.onclick = (ev) => {
    soundEl.classList.remove('selected')
    se.classList.add('selected')
    soundEl = se
    fetch(`audio/${sounds[soundEl.dataset.sound]}`).then(async res => sound = await res.blob())
  }
})

const previewAudio = new Audio()
let previewTimeout
previewAudio.oncanplay = () => {
  previewAudio.play()
  previewTimeout = setTimeout(() => {
    previewAudio.pause()
  }, 3000)
}

document.querySelectorAll('.preview').forEach(btn => {
  btn.addEventListener('click', (ev) => {
    clearTimeout(previewTimeout)
    ev.stopPropagation()
    const soundName = ev.target.closest('.sound-effect').dataset.sound
    previewAudio.src = `/audio/${sounds[soundName]}`
  })
})


let mediaRecorder
recordButton.addEventListener('click', async () => {
  recording = !recording
  if (recording) {
    recordButton.setAttribute('disabled', true)
    downloadButton.setAttribute('disabled', true)
    playButton.setAttribute('disabled', true)
    recordButton.textContent = 'Stop'
    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
      recordButton.removeAttribute('disabled')
      recordingDuration = 0;
      recordingInterval = setInterval(updateRecordingDuration, 1000); // Update the recording duration every second
      mediaRecorder = new MediaRecorder(stream)
      const chunks = []
      let recStartTime

      mediaRecorder.addEventListener('start', () => {
        recStartTime = Date.now()
      })
      mediaRecorder.addEventListener('dataavailable', (event) => {
        chunks.push(event.data)
      })

      mediaRecorder.addEventListener('stop', async () => {
        const recordingDuration = (Date.now() - recStartTime)
        const recordedBlob = new Blob(chunks, { type: 'audio/webm' })
        let file = sound

        const files = [file, recordedBlob]
        merge(files, recordingDuration)
      })

      // Start recording for a certain duration (e.g., 5 seconds)
      mediaRecorder.start()
    }).catch((error) => {
      console.error('Error accessing microphone:', error)
    })
  
  } else {
    mediaRecorder.stop()
    clearInterval(recordingInterval)
    recordButton.textContent = 'Record'
  }
})

// Function to update the recording duration
function updateRecordingDuration() {
  recordingDuration++;
  recordingDurationText.textContent = `Recording duration: ${formatDuration(recordingDuration)}`;
}

// Function to format the duration in mm:ss format
function formatDuration(durationInSeconds) {
  const minutes = Math.floor(durationInSeconds / 60);
  const seconds = durationInSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

const audioContext = new AudioContext()
function AudioBufferSlice(buffer, begin, end, callback) {
  if (!(this instanceof AudioBufferSlice)) {
    return new AudioBufferSlice(buffer, begin, end, callback)
  }

  let error = null

  let duration = buffer.duration
  let channels = buffer.numberOfChannels
  let rate = buffer.sampleRate

  if (typeof end === 'function') {
    callback = end
    end = duration
  }

  // milliseconds to seconds
  begin = begin/1000
  end = end/1000

  if (begin < 0) {
    error = new RangeError('begin time must be greater than 0')
  }

  if (end > duration) {
    error = new RangeError('end time must be less than or equal to ' + duration)
  }

  if (typeof callback !== 'function') {
    error = new TypeError('callback must be a function')
  }

  let startOffset = rate * begin
  let endOffset = rate * end
  let frameCount = endOffset - startOffset
  let newArrayBuffer

  try {
    newArrayBuffer = audioContext.createBuffer(channels, endOffset - startOffset, rate)
    let anotherArray = new Float32Array(frameCount)
    let offset = 0

    for (let channel = 0; channel < channels; channel++) {
      buffer.copyFromChannel(anotherArray, channel, startOffset)
      newArrayBuffer.copyToChannel(anotherArray, channel, offset)
    }
  } catch(e) {
    error = e
  }

  callback(error, newArrayBuffer)
}

let output
async function merge(files, maxDuration) {
  if (files.length) {
    // As we aren't using `crunker.fetchAudio`, we must convert the files to buffers manually,
    // is the same code from the source, just condensed and without need to `fetch` the files.
    const buffers = await Promise.all(
      Array.from(files).map(async (file) => crunker._context.decodeAudioData(await file.arrayBuffer()))
    )
    const merged = await crunker.mergeAudio(buffers)
    console.log('merged', merged)
    const src = URL.createObjectURL(files[0])
    const audioEl = new Audio(src)
    audioEl.onloadedmetadata = () => {
      if (audioEl.duration > maxDuration / 1000) {
        console.log('audioEl.duration > maxDuration')
        AudioBufferSlice(merged, 0, maxDuration, async (error, buffer) => {
          console.log('merged and sliced', buffer)
          output = await crunker.export(buffer, 'audio/mp3')
          downloadButton.removeAttribute('disabled')
          playButton.removeAttribute('disabled')
        })
      } else {
        alert('audioEl.duration < maxDuration')
      }
    }
  }
}

downloadButton.onclick = () => {
  if (output) {
    crunker.download(output.blob, 'voicenote')
  }
}

playButton.onclick = () => {
  if (output) {
    if (output.element.paused) {
      output.element.play()
    } else {
      output.element.pause()
    }
  }
}

new Crunker().notSupported(() => {
  window.alert('Browser unsupported!')
})
