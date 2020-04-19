import React from 'react';
import {
  Dimensions,
  Image,
  StyleSheet,
  Text,
  TouchableHighlight,
  View,
  Alert,
} from 'react-native';
import { Asset } from 'expo-asset';
import { Audio } from 'expo-av';
import * as Font from 'expo-font';
import * as Permissions from 'expo-permissions';

class Icon {
  constructor(module, width, height) {
    this.module = module;
    this.width = width;
    this.height = height;
    Asset.fromModule(this.module).downloadAsync();
  }
}

const ICON_RECORD_BUTTON = new Icon(require('./assets/images/record_button.png'), 70, 119);
const ICON_RECORDING = new Icon(require('./assets/images/record_icon.png'), 20, 14);
const { height: DEVICE_HEIGHT } = Dimensions.get('window');
const BACKGROUND_COLOR = '#FFF8ED';
const LIVE_COLOR = '#FF0000';
const DISABLED_OPACITY = 0.5;

export default class App extends React.Component {
  constructor(props) {
    super(props);
    this.recording = null;
    this.sound = null;    
    this.state = {
      haveRecordingPermissions: false,
      isLoading: false,
      recordingDuration: null,
      isRecording: false,
      fontLoaded: false,
    };
    
    Audio.RECORDING_OPTIONS_PRESET_LOW_QUALITY.ios.extension = '.wav'
    this.recordingSettings = JSON.parse(JSON.stringify(Audio.RECORDING_OPTIONS_PRESET_LOW_QUALITY));
    this.uri = null;
  }

  componentDidMount() {
    (async () => {
      await Font.loadAsync({
        'cutive-mono-regular': require('./assets/fonts/CutiveMono-Regular.ttf'),
      });
      this.setState({ fontLoaded: true });
    })();
    this._askForPermissions();
  }

  // asks user for mic permission
  _askForPermissions = async () => {
    const response = await Permissions.askAsync(Permissions.AUDIO_RECORDING);
    this.setState({
      haveRecordingPermissions: response.status == 'granted',
    });
  };

  _updateScreenForRecordingStatus = status => {
    if (status.canRecord) {
      this.setState({
        isRecording: status.isRecording,
        recordingDuration: status.durationMillis,
      });
    } else if (status.isDoneRecording) {
      this.setState({
        isRecording: false,
        recordingDuration: status.durationMillis,
      });
      if (!this.state.isLoading) {
        this._stopRecordingAndReturnPrediction();
      }
    }
  };

  async _stopPlaybackAndBeginRecording() {
    this.setState({
      isLoading: true,
    });
    
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      interruptionModeIOS: Audio.INTERRUPTION_MODE_IOS_DO_NOT_MIX,
      playsInSilentModeIOS: true,
      shouldDuckAndroid: true,
      interruptionModeAndroid: Audio.INTERRUPTION_MODE_ANDROID_DO_NOT_MIX,
      playThroughEarpieceAndroid: false,
      staysActiveInBackground: true,
    });

    if (this.recording !== null) {
      this.recording.setOnRecordingStatusUpdate(null);
      this.recording = null;
    }

    // creates new recording and beings recording 
    const recording = new Audio.Recording();
    await recording.prepareToRecordAsync(this.recordingSettings);
    recording.setOnRecordingStatusUpdate(this._updateScreenForRecordingStatus);

    this.recording = recording;
    await this.recording.startAsync(); 
    this.setState({
      isLoading: false,
    });
  }

  // stops the recording and returns the prediction
  async _stopRecordingAndReturnPrediction(number) {
    this.setState({
      isLoading: true,
    });
    try {
      await this.recording.stopAndUnloadAsync();
    } catch (error) {
    }

    // formats POST request and receives JSON response
    // https://github.com/expo/expo/issues/214#issuecomment-316950941
    const uri = this.recording.getURI();
    let apiUrl = "http://192.168.1.192:5000/model/predict?start_time=0";
    let uriParts = uri.split('.');
    let fileType = uriParts[uriParts.length - 1];

    let formData = new FormData();
    formData.append('audio', {
    uri: uri,
    name: "audio.wav",
    type: `audio/${fileType}`,
    });

    let options = {
    method: 'POST',
    body: formData,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'multipart/form-data',
    },
    };
    
    response = await fetch(apiUrl, options);
    const json = await response.json();
    console.log(json);

    // if recording too short, alerts user of error
    if (json.status == "error") {
      Alert.alert("Error", "Invalid Recording Time, Please Try Again");
      this.setState({
        isLoading: false,
      });
      return;
    }

    // Alert to ask user how many predictions they want to receive
    const AsyncAlert = () => {
      return new Promise((resolve, reject) => {
          Alert.alert(
              '# of Predictions',
              'Please choose how many predictions you want to receive:',
              [
                  {text: '1', onPress: () => resolve(1) },
                  {text: '2', onPress: () => resolve(2) },
                  {text: '3', onPress: () => resolve(3) },
                  {text: '4', onPress: () => resolve(4) },
                  {text: '5', onPress: () => resolve(5) },
              ],
              { cancelable: false }
          )
      })
    }    
    const predictionsWanted = await AsyncAlert()
   
    // formats the predictions that will be shown to user
    var returnedPrediction = "\n" 
    for(let i = 0; i < predictionsWanted; i++ )
    {
      returnedPrediction += "Prediction " + (i+1) + ": " + json.predictions[i].label + "\n" + "Probability: " 
                            + Math.floor((json.predictions[i].probability) * 100) + "%" + "\n\n";
    }

    // show user the predictions
    Alert.alert(
      "Predictions of Sounds Around You:",
      returnedPrediction)

    this.setState({
      isLoading: false,
    });
  }

  // when the record button is pressed
  _onRecordPressed = () => {
    if (this.state.isRecording) {
      this._stopRecordingAndReturnPrediction();
    } else {
      this._stopPlaybackAndBeginRecording();
    }
  };

  // converts to minutes/seconds form
  _getMMSSFromMillis(millis) {
    const totalSeconds = millis / 1000;
    const seconds = Math.floor(totalSeconds % 60);
    const minutes = Math.floor(totalSeconds / 60);

    const padWithZero = number => {
      const string = number.toString();
      if (number < 10) {
        return '0' + string;
      }
      return string;
    };

    return padWithZero(minutes) + ':' + padWithZero(seconds);
  }

  // gets the timestamp of recoridng
  _getRecordingTimestamp() {
    if (this.state.recordingDuration != null) {
      return `${this._getMMSSFromMillis(this.state.recordingDuration)}`;
    }
    return `${this._getMMSSFromMillis(0)}`;
  }

  render() {
    if(!this.state.fontLoaded) {
        return (
            <View style={styles.emptyContainer} />
        )
    }

    if (!this.state.haveRecordingPermissions){
        return (
            <View style={styles.container}>
                <View />
                <Text style={[styles.noPermissionsText, { fontFamily: 'cutive-mono-regular' }]}>
                  You must enable audio recording permissions in order to use this app.
                </Text>
                <View />
            </View>
        )
    }

    return (
      <View style={styles.container}>
        <View
          style={[
            styles.halfScreenContainer,
            {
              opacity: this.state.isLoading ? DISABLED_OPACITY : 1.0,
            },
          ]}>
          <View />
          <View style={styles.recordingContainer}>
            <View />
            <TouchableHighlight
              underlayColor={BACKGROUND_COLOR}
              style={styles.recordButton}
              onPress={this._onRecordPressed}
              disabled={this.state.isLoading}>
              <Text style = {[styles.recordText, { fontFamily: 'cutive-mono-regular' }]}> RECORD/STOP </Text>
            </TouchableHighlight>
            <View style={styles.recordingDataContainer}>
              <View />
              <Text style={[styles.liveText, { fontFamily: 'cutive-mono-regular' }]}>
                {this.state.isRecording ? 'RECORDING' : ''}
              </Text>
              <View style={styles.recordingDataRowContainer}>
                <Image
                  style={[styles.image, { opacity: this.state.isRecording ? 1.0 : 0.0 }]}
                  source={ICON_RECORDING.module} />
                <Text style={[styles.recordingTimestamp, { fontFamily: 'cutive-mono-regular' }]}>
                  {this._getRecordingTimestamp()}
                </Text>
              </View>
              <View/>
            </View>
            <View />
          </View>
                <Text> Record to Receive Predictions </Text>
                <Text> of the Sounds Around You </Text> 
          <View />
        </View>
      <View/>
    </View>

    );
  }
}

const styles = StyleSheet.create({
  emptyContainer: {
    alignSelf: 'stretch',
    backgroundColor: BACKGROUND_COLOR,
  },
  container: {
    flex: 1,
    flexDirection: 'column',
    justifyContent: 'space-between',
    alignItems: 'center',
    alignSelf: 'stretch',
    backgroundColor: BACKGROUND_COLOR,
    minHeight: DEVICE_HEIGHT,
    maxHeight: DEVICE_HEIGHT,
  },
  noPermissionsText: {
    textAlign: 'center',
  },
  halfScreenContainer: {
    flex: 1,
    flexDirection: 'column',
    justifyContent: 'space-between',
    alignItems: 'center',
    alignSelf: 'stretch',
    minHeight: DEVICE_HEIGHT / 2.0,
    maxHeight: DEVICE_HEIGHT / 2.0,
  },
  recordButton: {
    backgroundColor: "#000000",
    borderRadius: 50,
    borderWidth: 1,
    borderColor: "#694966",
    padding: 12,
  },
  recordText: {
    color: BACKGROUND_COLOR
  },
  recordingContainer: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  recordingDataContainer: {
    flex: 1,
    flexDirection: 'column',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: ICON_RECORD_BUTTON.height,
    maxHeight: ICON_RECORD_BUTTON.height,
    minWidth: ICON_RECORD_BUTTON.width * 3.0,
    maxWidth: ICON_RECORD_BUTTON.width * 3.0,
  },
  recordingDataRowContainer: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: ICON_RECORDING.height,
    maxHeight: ICON_RECORDING.height,
  },
  liveText: {
    color: LIVE_COLOR,
  },
  recordingTimestamp: {
    paddingLeft: 20,
  },
  image: {
    backgroundColor: BACKGROUND_COLOR,
  },
});
