from speechbrain.pretrained import EncoderClassifier
import torchaudio

classifier = EncoderClassifier.from_hparams(
    source="speechbrain/emotion-recognition-wav2vec2-IEMOCAP"
)
signal, fs = torchaudio.load("tmp/last_upload.wav")
prediction = classifier.classify_batch(signal)
print(prediction)