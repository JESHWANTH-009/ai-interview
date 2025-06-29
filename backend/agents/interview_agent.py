import os
from dotenv import load_dotenv
import google.generativeai as genai
import json
import re
import ast

load_dotenv()
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

model = genai.GenerativeModel("gemini-2.0-flash")

def extract_text_from_response(response) -> str:
    """
    Safely extract text from Gemini response, handling missing parts or attributes.
    """
    try:
        if hasattr(response, 'text') and response.text:
            return response.text.strip()
        elif hasattr(response, 'parts') and response.parts:
            return response.parts[0].text.strip()
    except Exception as e:
        print(f"[ERROR] extract_text_from_response failed: {e}")
    return "Failed to extract valid response text from Gemini."


async def generate_first_question(role: str, experience: str) -> str:
    """
    Generates the first interview question based on the role and experience.
    """
    prompt = (
        f"You are an AI Interview Coach specializing in {role} roles. "
        f"The candidate has {experience} of experience. "
        "Start the interview by asking a relevant first question. "
        "Keep the question concise and professional. Do not include any greetings or conversational fillers, just the question itself."
        "Example: Tell me about your experience with Python development."
        f"Candidate: {role}, Experience: {experience}"
        "First question:"
    )
    try:
        response = await model.generate_content_async(prompt) # Use async method if available
        # Fallback for older genai versions or if async method isn't explicit
        if hasattr(response, 'text'):
            return response.text.strip()
        elif response.parts: # For direct parts access
            return response.parts[0].text.strip()
        else:
            return "Failed to generate question: No text in response."
    except Exception as e:
        print(f"Error generating first question with Gemini API: {e}")
        return "Failed to generate the first question. Please try again later."


async def generate_next_question(
    role: str,
    experience: str,
    conversation_history: list[dict]
) -> str:
    """
    Generates the next interview question based on the role, experience,
    and the ongoing conversation history.
    conversation_history is a list of dictionaries, like:
    [
        {"role": "user", "parts": ["What is your favorite programming language?"]},
        {"role": "model", "parts": ["My favorite programming language is Python."]},
        ...
    ]
    """
    # Prepare the prompt for the next question, considering the history
    system_instruction = (
        f"You are an AI Interview Coach specializing in {role} roles. "
        f"The candidate has {experience} of experience. "
        "Based on the conversation so far, ask a relevant and challenging next question. "
        "Do not greet the candidate or provide any feedback on their previous answer. "
        "Just ask the next question directly. If the interview seems complete, ask a concluding question or suggest ending."
    )

    try:
        # Use the chat session for multi-turn conversation
        # conversation_history is already in the correct format for Gemini's history
        chat = model.start_chat(history=conversation_history)
        
        # Send a prompt to get the next question. The system instruction influences the entire chat.
        response = await chat.send_message_async(system_instruction + "\n\nWhat is the next question?")
        
        # Access the text from the response
        if hasattr(response, 'text'):
            return response.text.strip()
        elif response.parts: # For direct parts access
            return response.parts[0].text.strip()
        else:
            return "Failed to generate next question: No text in response."
    except Exception as e:
        print(f"Error generating next question with Gemini API: {e}")
        return "Failed to generate the next question. Please try again later."

# Optional: Function to evaluate an answer
async def evaluate_answer(role: str, experience: str, question: str, answer: str) -> dict: 
    ## the output of this function to be dictionary

    """
    Evaluates a candidate's answer based on the role, experience, and question.
    Returns a brief evaluation or feedback.
    """
    prompt = (
        f"You are an AI Interview Coach specializing in {role} roles with {experience} of experience. "
        f"Evaluate the following answer to the question '{question}'. "
        f"Candidate's answer: '{answer}'. "
        "Provide a structured JSON output with the following fields:\n"
        "- 'correctness': A brief assessment (e.g., 'Correct', 'Partially Correct', 'Incorrect').\n"
        "- 'depth': A brief assessment of depth (e.g., 'Shallow', 'Good', 'Excellent').\n"
        "- 'relevance': A brief assessment of relevance (e.g., 'High', 'Medium', 'Low').\n"
        "- 'score': An integer score from 0 to 10, where 0 is completely incorrect/irrelevant and 10 is perfect.\n"
        "- 'detailed_feedback': Comprehensive, constructive feedback on the answer. This should be concise paragraphs.\n"
        "- 'suggestions_for_improvement': Actionable advice for the candidate to improve. Use bullet points if applicable.\n\n"
        "Ensure the output is a valid JSON object. Do not include any other text outside the JSON."
    )

    # Define the generation configuration for structured output
    generation_config = {
        "response_mime_type": "application/json",
        "response_schema": {
            "type": "OBJECT",
            "properties": {
                "correctness": {"type": "STRING"},
                "depth": {"type": "STRING"},
                "relevance": {"type": "STRING"},
                "score": {"type": "NUMBER"}, # Use NUMBER for integers
                "detailed_feedback": {"type": "STRING"},
                "suggestions_for_improvement": {"type": "STRING"}
            },
            "required": ["correctness", "depth", "relevance", "score", "detailed_feedback", "suggestions_for_improvement"]
        }
    }
    try:
        response = await model.generate_content_async(prompt,generation_config=generation_config)

        if not response or not hasattr(response, 'text') or not response.text:
            print("[ERROR] Gemini API returned empty or malformed response for evaluation.")
            return {
                "correctness": "N/A", "depth": "N/A", "relevance": "N/A", "score": 0,
                "detailed_feedback": "Evaluation failed: No valid response from AI.",
                "suggestions_for_improvement": "Please try again."
            }

        try:
            # Parse the JSON string from the response
            feedback_dict = json.loads(response.text.strip())
            # Ensure the score is an integer
            feedback_dict['score'] = int(feedback_dict.get('score', 0))
            return feedback_dict
        except json.JSONDecodeError as jde:
            print(f"[ERROR] JSON decoding failed: {jde} - Raw response: {response.text}")
            return {
                "correctness": "N/A", "depth": "N/A", "relevance": "N/A", "score": 0,
                "detailed_feedback": f"Evaluation failed: Invalid JSON format from AI. Error: {jde}. Raw: {response.text[:200]}...",
                "suggestions_for_improvement": "The AI provided malformed feedback. Please check AI response generation."
            }
        except Exception as ex:
            print(f"[ERROR] Unexpected error processing Gemini response: {ex} - Raw response: {response.text}")
            return {
                "correctness": "N/A", "depth": "N/A", "relevance": "N/A", "score": 0,
                "detailed_feedback": f"Evaluation failed: Unexpected error processing AI response. Error: {ex}.",
                "suggestions_for_improvement": "Internal error. Check logs."
            }

    except Exception as e:
        print(f"[EXCEPTION] Error evaluating answer with Gemini API: {e}")
        return {
            "correctness": "N/A", "depth": "N/A", "relevance": "N/A", "score": 0,
            "detailed_feedback": f"Evaluation failed due to an unexpected exception: {e}",
            "suggestions_for_improvement": "Please ensure the API key is correct and the model is accessible."
        }


def generate_overall_feedback(interview_data: dict) -> str:
    """
    Generates overall feedback for the entire interview.
    interview_data will contain a list of answered questions with user answers and evaluations.
    Example structure:
    {
        "role": "Python Developer",
        "experience": "2 years",
        "questions": [
            {"question": "Q1 text", "user_answer": "A1 text", "evaluation_feedback": "Eval1 text"},
            {"question": "Q2 text", "user_answer": "A2 text", "evaluation_feedback": "Eval2 text"},
            ...
        ]
    }
    """
    if not interview_data.get("questions"):
        return "No questions were answered during this interview."

    prompt_parts = [
        f"You are an AI Interview Coach. Provide comprehensive overall feedback for an interview based on the following role, experience, and the questions asked, user's answers, and your previous evaluation for each answer.\n\n",
        f"**Interview Context:**\n",
        f"- Role: {interview_data.get('role', 'N/A')}\n",
        f"- Experience: {interview_data.get('experience', 'N/A')}\n\n",
        f"**Interview Transcript and Evaluations:**\n"
    ]

    for i, qa_pair in enumerate(interview_data["questions"]):
        prompt_parts.append(f"--- Question {i+1} ---\n")
        prompt_parts.append(f"Question: {qa_pair.get('question', 'N/A')}\n")
        prompt_parts.append(f"User Answer: {qa_pair.get('user_answer', 'N/A')}\n")
        # Ensure that `evaluation_feedback` is treated as a string for the prompt
        # even if it was originally a dict for storage.
        # The `interview.py` now ensures `eval_summary` is a string for this part.
        prompt_parts.append(f"Evaluation: {qa_pair.get('evaluation_feedback', 'No feedback provided')}\n\n")

    prompt_parts.append(f"**Overall Feedback Request:**\n")
    prompt_parts.append(f"Based on the above, provide an overall assessment of the candidate's performance. Focus on:\n")
    prompt_parts.append(f"- Strengths and weaknesses across the interview.\n")
    prompt_parts.append(f"- Areas for improvement.\n")
    prompt_parts.append(f"- General recommendation (e.g., 'Strong candidate', 'Needs more practice in X', 'Good foundational knowledge but lacks Y').\n")
    prompt_parts.append(f"Keep the feedback concise but comprehensive, using clear bullet points or paragraphs for readability. Use markdown for headings and bullet points where appropriate (e.g., **Strengths:**, - Point).")

    prompt = "".join(prompt_parts)

    try:
        # This is a synchronous call, handled by asyncio.to_thread in interview.py
        response = model.generate_content(prompt)
        return response.text
    except Exception as e:
        print(f"Error generating overall feedback: {e}")
        return "Failed to generate overall feedback due to an internal error."