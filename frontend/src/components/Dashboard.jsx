import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';
import api from '../api';
import './dashboard.css';

const Dashboard = ({ user }) => {
    const navigate = useNavigate();
    const [profile, setProfile] = useState(null);
    const [loadingProfile, setLoadingProfile] = useState(true);
    const [profileError, setProfileError] = useState(null);

    const [interviewRole, setInterviewRole] = useState('');
    const [interviewExperience, setInterviewExperience] = useState('');
    const [interviewStarted, setInterviewStarted] = useState(false); // True when an interview is active
    const [currentInterviewId, setCurrentInterviewId] = useState(null);
    const [currentQuestion, setCurrentQuestion] = useState('');
    const [userAnswer, setUserAnswer] = useState('');
    const [interviewLoading, setInterviewLoading] = useState(false); // For API calls (start, answer, end)
    const [interviewError, setInterviewError] = useState(null);

    const [evaluationFeedback, setEvaluationFeedback] = useState('');
    const [lastQuestionAnswered, setLastQuestionAnswered] = useState('');
    const [lastUserAnswer, setLastUserAnswer] = useState('');
    const [nextQuestionFromAPI, setNextQuestionFromAPI] = useState('');
    const [showNextQuestionButton, setShowNextQuestionButton] = useState(false);

    const [overallFeedback, setOverallFeedback] = useState(null);
    const [showOverallFeedback, setShowOverallFeedback] = useState(false);

    // --- NEW STATES FOR VOICE FEATURE ---
    const [isRecording, setIsRecording] = useState(false);
    const [recognition, setRecognition] = useState(null);
    const [browserSupportsSpeechRecognition, setBrowserSupportsSpeechRecognition] = useState(true);
    const [liveTranscription, setLiveTranscription] = useState(''); // To show live transcription as user speaks
    // --- END NEW STATES ---

    // --- useEffect FOR SPEECH RECOGNITION INITIALIZATION ---
    useEffect(() => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

        if (SpeechRecognition) {
            const newRecognition = new SpeechRecognition();
            newRecognition.continuous = true; // Set to true to capture longer speech with pauses
            newRecognition.interimResults = true; // Set to true to get real-time interim results
            newRecognition.lang = 'en-US'; // Set language. Adjust if your users speak other languages.

            newRecognition.onstart = () => {
                console.log('Voice recognition started. Speak into the microphone.');
                setIsRecording(true);
                setUserAnswer(''); // Clear previous final answer when starting new recording
                setLiveTranscription(''); // Clear live transcription preview
                setInterviewError(null); // Clear any previous error message
            };

            newRecognition.onresult = (event) => {
                let interimTranscript = '';
                let finalTranscript = '';

                // Loop through results to get both interim and final transcripts
                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    const transcript = event.results[i][0].transcript;
                    if (event.results[i].isFinal) {
                        finalTranscript += transcript;
                    } else {
                        interimTranscript += transcript;
                    }
                }
                // Update the live transcription preview
                setLiveTranscription(finalTranscript + interimTranscript);
                // Accumulate final (confirmed) transcription to userAnswer
                // This means userAnswer will build up as user completes phrases
                setUserAnswer(prevAnswer => prevAnswer + finalTranscript);
            };

            newRecognition.onerror = (event) => {
                console.error('Speech recognition error:', event.error);
                // Handle 'no-speech' gracefully if already recording (don't stop, just log)
                if (event.error === 'no-speech' && isRecording) {
                    console.log("No speech detected during continuous listening, continuing to listen.");
                    // Optionally, provide a subtle visual cue or a temporary message
                } else if (event.error === 'not-allowed') {
                    setInterviewError("Microphone access denied. Please allow microphone access in your browser settings or type your answer.");
                    setIsRecording(false);
                    setLiveTranscription('');
                } else {
                    setInterviewError(`Voice input error: ${event.error}. Please try again or type your answer.`);
                    setIsRecording(false);
                    setLiveTranscription('');
                }
            };

            newRecognition.onend = () => {
                console.log('Voice recognition ended.');
                setIsRecording(false);
                setLiveTranscription(''); // Clear live transcription when recording stops
                // The final accumulated answer should already be in userAnswer
            };

            setRecognition(newRecognition);
            setBrowserSupportsSpeechRecognition(true);
        } else {
            console.warn('Web Speech API (SpeechRecognition) not supported in this browser.');
            setBrowserSupportsSpeechRecognition(false);
            setInterviewError("Your browser doesn't support voice input. Please type your answers.");
        }

        // Cleanup function for when the component unmounts
        return () => {
            if (recognition && isRecording) {
                recognition.stop(); // Stop any active recognition
            }
        };
    }, []); // Empty dependency array means this effect runs once on mount
    // --- END useEffect ---


    useEffect(() => {
        const fetchUserProfile = async () => {
            if (!user || !user.uid) {
                setLoadingProfile(false);
                return;
            }

            try {
                setLoadingProfile(true);
                setProfileError(null);
                const idToken = await user.getIdToken();
                console.log("Firebase ID Token:", idToken);
                const response = await api.get('/user/profile', {
                    headers: {
                        Authorization: `Bearer ${idToken}`,
                    },
                });
                setProfile(response.data);
                console.log("User profile fetched:", response.data);
            } catch (error) {
                console.error("Error fetching user profile:", error);
                setProfileError(error.response?.data?.detail || error.message || "Network Error");
            } finally {
                setLoadingProfile(false);
            }
        };

        fetchUserProfile();
    }, [user]);

    const handleLogout = async () => {
        try {
            await signOut(auth);
            console.log("User logged out successfully.");
            navigate('/login');
        } catch (error) {
            console.error("Logout error:", error.message);
        }
    };

    const handleStartInterview = async () => {
        if (!interviewRole.trim() || !interviewExperience.trim()) {
            setInterviewError("Please enter both role and experience to start the interview.");
            return;
        }

        setInterviewLoading(true);
        setInterviewError(null);
        setEvaluationFeedback('');
        setLastQuestionAnswered('');
        setLastUserAnswer('');
        setNextQuestionFromAPI('');
        setShowNextQuestionButton(false);
        setOverallFeedback(null);
        setShowOverallFeedback(false);

        try {
            const idToken = await user.getIdToken();
            const response = await api.post('/interview/start', {
                role: interviewRole,
                experience: interviewExperience
            }, {
                headers: {
                    Authorization: `Bearer ${idToken}`,
                },
            });
            console.log("Interview started successfully:", response.data);
            setCurrentInterviewId(response.data.interview_id);
            setCurrentQuestion(response.data.first_question);
            setInterviewStarted(true);
            setUserAnswer('');
        } catch (error) {
            console.error("Error starting interview:", error);
            setInterviewError(error.response?.data?.detail || error.message || "Failed to start interview.");
        } finally {
            setInterviewLoading(false);
        }
    };

    const handleSubmitAnswer = async () => {
        // Stop recording before submitting, if still active
        if (isRecording && recognition) {
            recognition.stop();
        }

        if (!currentInterviewId || !currentQuestion || !userAnswer.trim()) {
            setInterviewError("Please provide an answer to the current question.");
            return;
        }

        setInterviewLoading(true);
        setInterviewError(null);

        setLastQuestionAnswered(currentQuestion);
        setLastUserAnswer(userAnswer);

        setEvaluationFeedback('');
        setNextQuestionFromAPI('');
        setShowNextQuestionButton(false);
        setOverallFeedback(null);
        setShowOverallFeedback(false);

        try {
            const idToken = await user.getIdToken();
            const response = await api.post('/interview/answer', {
                interview_id: currentInterviewId,
                question_text: currentQuestion,
                answer_text: userAnswer
            }, {
                headers: {
                    Authorization: `Bearer ${idToken}`,
                },
            });
            console.log("Answer submitted and next question received:", response.data);
            setEvaluationFeedback(response.data.display_feedback);
            setNextQuestionFromAPI(response.data.next_question);
            setShowNextQuestionButton(true);
            setUserAnswer(''); // Clear answer input for next question
        } catch (error) {
            console.error("Error submitting answer:", error);
            setInterviewError(error.response?.data?.detail || error.message || "Failed to submit answer.");
        } finally {
            setInterviewLoading(false);
        }
    };

    const handleNextQuestion = () => {
        setCurrentQuestion(nextQuestionFromAPI);
        setEvaluationFeedback('');
        setLastQuestionAnswered('');
        setLastUserAnswer('');
        setNextQuestionFromAPI('');
        setShowNextQuestionButton(false);
        setUserAnswer('');
    };

    const handleEndInterview = async () => {
        // Stop recording before ending interview, if still active
        if (isRecording && recognition) {
            recognition.stop();
        }

        if (!currentInterviewId) {
            setInterviewError("No active interview to end.");
            return;
        }

        setInterviewLoading(true);
        setInterviewError(null);
        setShowOverallFeedback(false);

        try {
            const idToken = await user.getIdToken();
            const response = await api.post(`/interview/end?interview_id=${currentInterviewId}`, {}, {
                headers: {
                    Authorization: `Bearer ${idToken}`,
                },
            });
            console.log("Interview ended successfully:", response.data);

            setOverallFeedback(response.data.overall_feedback);
            setShowOverallFeedback(true);

            setInterviewStarted(false);
            setCurrentInterviewId(null);
            setCurrentQuestion('');
            setUserAnswer('');
            setEvaluationFeedback('');
            setLastQuestionAnswered('');
            setLastUserAnswer('');
            setNextQuestionFromAPI('');
            setShowNextQuestionButton(false);
            setInterviewRole('');
            setInterviewExperience('');

        } catch (error) {
            console.error("Error ending interview:", error);
            setInterviewError(error.response?.data?.detail || error.message || "Failed to end interview.");
        } finally {
            setInterviewLoading(false);
        }
    };

    const renderOverallFeedback = (feedback) => {
        if (!feedback) return null;

        return (
            <div className="feedback-content">
                {feedback.overall_assessment && (
                    <>
                        <h4 className="font-semibold text-lg mt-2">Overall Assessment:</h4>
                        <p className="text-base">{feedback.overall_assessment}</p>
                    </>
                )}
                {feedback.strengths && feedback.strengths.length > 0 && (
                    <>
                        <h4 className="font-semibold text-lg mt-2">Strengths:</h4>
                        <ul className="list-disc list-inside text-base">
                            {feedback.strengths.map((item, index) => <li key={index}>{item}</li>)}
                        </ul>
                    </>
                )}
                {feedback.weaknesses && feedback.weaknesses.length > 0 && (
                    <>
                        <h4 className="font-semibold text-lg mt-2">Weaknesses:</h4>
                        <ul className="list-disc list-inside text-base">
                            {feedback.weaknesses.map((item, index) => <li key={index}>{item}</li>)}
                        </ul>
                    </>
                )}
                {feedback.areas_for_improvement && feedback.areas_for_improvement.length > 0 && (
                    <>
                        <h4 className="font-semibold text-lg mt-2">Areas for Improvement:</h4>
                        <ul className="list-disc list-inside text-base">
                            {feedback.areas_for_improvement.map((item, index) => <li key={index}>{item}</li>)}
                        </ul>
                    </>
                )}
                {feedback.general_recommendation && (
                    <>
                        <h4 className="font-semibold text-lg mt-2">General Recommendation:</h4>
                        <p className="text-base">{feedback.general_recommendation}</p>
                    </>
                )}
            </div>
        );
    };

    // --- handleRecordAnswer FUNCTION ---
    const handleRecordAnswer = () => {
        if (recognition) {
            if (!isRecording) { // If not currently recording, start
                navigator.mediaDevices.getUserMedia({ audio: true })
                    .then(() => {
                        // Abort any previous recognition instance before starting a new one
                        if (recognition && recognition.abort) {
                            recognition.abort();
                        }
                        recognition.start();
                    })
                    .catch(err => {
                        console.error("Microphone access denied:", err);
                        setInterviewError("Microphone access denied. Please allow microphone access in your browser settings or type your answer.");
                        setIsRecording(false);
                    });
            } else { // If currently recording, stop
                recognition.stop();
            }
        }
    };
    // --- END handleRecordAnswer ---


    return (
        <div className="dashboard-background flex flex-col items-center justify-start relative">

            <button
                onClick={handleLogout}
                className="logout-button"
            >
                Logout
            </button>

            <h2 className="ai-interview-title mt-24">
                AI Interview Coach
            </h2>

            <div className="dashboard-card text-center">

                {loadingProfile ? (
                    <div className="text-blue-600 font-semibold text-lg">Loading profile...</div>
                ) : profileError ? (
                    <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">
                        <strong className="font-bold">Error!</strong>
                        <span className="block sm:inline"> {profileError}</span>
                    </div>
                ) : profile && (
                    <div className="info-box">
                        <p className="text-lg font-semibold text-blue-800">Welcome, {profile.email}!</p>
                        <p className="text-sm text-blue-700">UID: {profile.uid}</p>
                        {profile.display_name && <p className="text-sm text-blue-700">Name: {profile.display_name}</p>}
                    </div>
                )}

                {/* Conditional rendering for overall feedback */}
                {showOverallFeedback && overallFeedback && (
                    <div className="feedback-box mb-6 p-6">
                        <h3 className="text-2xl font-bold mb-4 text-gray-800">Interview Summary</h3>
                        {renderOverallFeedback(overallFeedback)}
                        <button
                            onClick={() => {
                                setShowOverallFeedback(false);
                                setOverallFeedback(null); // Clear overall feedback data when closing
                                setInterviewRole('');
                                setInterviewExperience('');
                            }}
                            className="custom-button start-interview-button mt-4"
                        >
                            Start New Interview
                        </button>
                    </div>
                )}

                {/* Main content logic: Show start form, or current interview. */}
                {!interviewStarted && !showOverallFeedback ? (
                    <div className="mb-6 p-6 border border-gray-300 rounded-lg bg-gray-50">
                        <h3 className="text-2xl font-bold mb-5 text-gray-800">Start New Interview</h3>

                        <input
                            type="text"
                            placeholder="Role (e.g., Python Developer)"
                            value={interviewRole}
                            onChange={(e) => setInterviewRole(e.target.value)}
                            className="custom-input"
                        />

                        <input
                            type="text"
                            placeholder="Experience (e.g., 2 years)"
                            value={interviewExperience}
                            onChange={(e) => setInterviewExperience(e.target.value)}
                            className="custom-input"
                        />

                        <button
                            onClick={handleStartInterview}
                            className="custom-button start-interview-button"
                            disabled={interviewLoading}
                        >
                            {interviewLoading ? 'Starting Interview...' : 'Start New Interview'}
                        </button>
                        {interviewError && <p className="error-message">{interviewError}</p>}
                    </div>
                ) : interviewStarted && !showOverallFeedback ? (
                    <div className="mb-6 p-6 border border-gray-300 rounded-lg bg-gray-50">
                        <h3 className="text-2xl font-bold mb-5 text-gray-800">Current Interview</h3>

                        {showNextQuestionButton ? (
                            <>
                                <div className="info-box">
                                    <p className="text-lg font-medium text-blue-800 break-words">
                                        <span className="font-bold">Question:</span> {lastQuestionAnswered}
                                    </p>
                                    <p className="text-lg font-medium text-blue-800 break-words mt-2">
                                        <span className="font-bold">Your Answer:</span> {lastUserAnswer}
                                    </p>
                                </div>
                                {evaluationFeedback && (
                                    <div className="feedback-box">
                                        <p className="font-bold mb-1">Feedback:</p>
                                        <p className="text-sm whitespace-pre-wrap">{evaluationFeedback}</p>
                                    </div>
                                )}
                                <button
                                    onClick={handleNextQuestion}
                                    className="custom-button start-interview-button"
                                    disabled={interviewLoading}
                                >
                                    {interviewLoading ? 'Loading Next Question...' : 'Next Question'}
                                </button>
                            </>
                        ) : (
                            <>
                                <div className="info-box">
                                    <p className="text-lg font-medium text-blue-800 break-words">{currentQuestion}</p>
                                </div>

                                {/* Display live transcription */}
                                {isRecording && liveTranscription && (
                                    <div className="live-transcription-preview">
                                        <p className="text-sm text-gray-600 font-italic">
                                            {liveTranscription}
                                        </p>
                                    </div>
                                )}

                                <textarea
                                    placeholder="Type your answer here..."
                                    value={userAnswer}
                                    onChange={(e) => setUserAnswer(e.target.value)}
                                    rows="6"
                                    cols="50"
                                    className="custom-input resize-y"
                                    disabled={interviewLoading || isRecording} // Disable typing if recording
                                ></textarea>
                                {/* --- NEW VOICE INPUT BUTTON --- */}
                                {browserSupportsSpeechRecognition && (
                                    <button
                                        onClick={handleRecordAnswer}
                                        className={`custom-button voice-input-button ${isRecording ? 'recording-active' : ''}`}
                                        disabled={interviewLoading} // Disable if an API call is in progress
                                    >
                                        {isRecording ? 'Click to Stop Recording' : 'Record Answer with Voice'}
                                    </button>
                                )}
                                {!browserSupportsSpeechRecognition && (
                                     <p className="error-message mt-2">Your browser doesn't support voice input. Please type your answers.</p>
                                )}
                                {/* --- END NEW VOICE INPUT BUTTON --- */}
                                <div className="flex flex-col sm:flex-row gap-3 mt-4"> {/* Added mt-4 for spacing */}
                                    <button
                                        onClick={handleSubmitAnswer}
                                        className="custom-button submit-answer-button"
                                        disabled={interviewLoading || isRecording || !userAnswer.trim()} // Disable submit if recording or answer is empty
                                    >
                                        {interviewLoading ? 'Submitting Answer...' : 'Submit Answer'}
                                    </button>
                                    <button
                                        onClick={handleEndInterview}
                                        className="custom-button end-interview-button"
                                        disabled={interviewLoading || isRecording} // Disable end if recording
                                    >
                                        End Interview
                                    </button>
                                </div>
                            </>
                        )}
                        {interviewError && <p className="error-message">{interviewError}</p>}
                    </div>
                ) : null}
            </div>
        </div>
    );
};

export default Dashboard;