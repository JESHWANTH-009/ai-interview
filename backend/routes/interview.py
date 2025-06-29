from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from agents.interview_agent import (
    generate_first_question,
    generate_next_question,
    evaluate_answer,
    generate_overall_feedback
)
from firebase_admin import firestore
import asyncio
from auth import get_current_user_data
from datetime import datetime
import re
import ast  # Needed for safe string-to-dict conversion


db = firestore.client()

router = APIRouter(
    prefix="/interview",
    tags=["Interview Flow"]
)

class InterviewRequest(BaseModel):
    role: str
    experience: str

class AnswerRequest(BaseModel):
    interview_id: str
    question_text: str
    answer_text: str

class InterviewEndResponse(BaseModel):
    message: str
    overall_feedback: dict = None

def format_overall_feedback(raw_feedback: str) -> dict:
    formatted_feedback = {
        "overall_assessment": "",
        "strengths": [],
        "weaknesses": [],
        "areas_for_improvement": [],
        "general_recommendation": ""
    }

    # Use a more robust splitting pattern that includes the section titles in the split result
    # and then iterate to pair them up.
    # The regex ensures that the split preserves the delimiter (the bolded titles).
    parts = re.split(r'\*\*(Overall Assessment|Strengths|Weaknesses|Areas for Improvement|General Recommendation):\*\*', raw_feedback, flags=re.IGNORECASE)

    # The first part is usually empty or intro text before the first bolded heading
    if parts and parts[0].strip():
        # Clean up any introductory phrase that might precede the first actual section
        intro_text = re.sub(
            r'^(Okay, based on the provided transcript and evaluations, here\'s an overall assessment of the candidate\'s performance:)',
            '', parts[0].strip(), flags=re.IGNORECASE
        ).strip()
        if intro_text: # Only add if there's actual content
            formatted_feedback["overall_assessment"] = intro_text

    # Iterate through the parts, pairing heading with content
    for i in range(1, len(parts), 2):
        heading_key = parts[i].strip().lower().replace(' ', '_')
        content = parts[i+1].strip()

        if heading_key == "overall_assessment":
            # If an overall assessment was already set from the intro, prepend/append if necessary
            if formatted_feedback["overall_assessment"] and content:
                # Decide if you want to concatenate or overwrite
                formatted_feedback["overall_assessment"] = f"{formatted_feedback['overall_assessment']}\n\n{content}"
            elif content:
                formatted_feedback["overall_assessment"] = content
        elif heading_key == "strengths":
            # Split list items by common bullet indicators
            formatted_feedback["strengths"] = [item.strip() for item in re.split(r'^\*\s*|\-\s*', content, flags=re.MULTILINE) if item.strip()]
        elif heading_key == "weaknesses":
            formatted_feedback["weaknesses"] = [item.strip() for item in re.split(r'^\*\s*|\-\s*', content, flags=re.MULTILINE) if item.strip()]
        elif heading_key == "areas_for_improvement":
            formatted_feedback["areas_for_improvement"] = [item.strip() for item in re.split(r'^\*\s*|\-\s*', content, flags=re.MULTILINE) if item.strip()]
        elif heading_key == "general_recommendation":
            formatted_feedback["general_recommendation"] = content

    return formatted_feedback


@router.post('/start')
async def start_interview(data: InterviewRequest, user_data: dict = Depends(get_current_user_data)):
    print("[DEBUG] /interview/start endpoint hit")
    print(f"[DEBUG] Incoming data: role='{data.role}' experience='{data.experience}'")

    user_uid = user_data['uid']
    user_email = user_data['email']

    try:
        active_query = db.collection('interviews') \
            .where('user_uid', '==', user_uid) \
            .where('is_active', '==', True)

        active_docs = await asyncio.to_thread(active_query.stream)
        for doc in active_docs:
            await asyncio.to_thread(doc.reference.update, {"is_active": False, 'ended_at': datetime.utcnow()})

        print(f"[INFO] Deactivated old interviews for {user_uid}")
        print("[DEBUG] Generating first question")

        first_question = await generate_first_question(data.role, data.experience)
        print(f"[INFO] First question: {first_question}")

        interview_data = {
            "user_uid": user_uid,
            "user_email": user_email,
            "role": data.role,
            "experience": data.experience,
            "questions": [{
                "text": first_question,
                "timestamp": datetime.utcnow().isoformat(),
                "from_ai": True
            }],
            "answers": [],
            "evaluation": [],
            "is_active": True,
            "created_at": firestore.SERVER_TIMESTAMP
        }

        doc_ref = await asyncio.to_thread(lambda: db.collection('interviews').add(interview_data)[1])
        interview_id = doc_ref.id
        print(f"[DEBUG] Interview doc created with ID: {interview_id}")

        return {
            "message": "Interview started successfully",
            "interview_id": interview_id,
            "first_question": first_question
        }

    except Exception as e:
        print(f"[ERROR] Interview creation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post('/answer')
async def submit_answer(data: AnswerRequest, user_data: dict = Depends(get_current_user_data)):
    user_uid = user_data['uid']
    interview_ref = db.collection('interviews').document(data.interview_id)

    try:
        interview_doc = await asyncio.to_thread(interview_ref.get)
        if not interview_doc.exists:
            raise HTTPException(status_code=404, detail="Interview not found.")

        interview_data = interview_doc.to_dict()
        if interview_data.get('user_uid') != user_uid or not interview_data.get('is_active'):
            raise HTTPException(status_code=403, detail="Unauthorized or inactive interview.")

        # 🧠 Evaluate the user's answer using Gemini
        # Now expects a dictionary from evaluate_answer
        evaluation_feedback_dict = await evaluate_answer(
            interview_data['role'],
            interview_data['experience'],
            data.question_text,
            data.answer_text
        )

        print(f"[INFO] Evaluation: {evaluation_feedback_dict}")

        # ✅ Build valid conversation history for Gemini
        conversation_history = []
        questions = interview_data.get('questions', [])
        answers = interview_data.get('answers', [])

        for i in range(len(questions)):
            question = questions[i]
            question_text = question.get("text", "") if isinstance(question, dict) else str(question)
            conversation_history.append({"role": "model", "parts": [question_text]})

            if i < len(answers):
                answer = answers[i]
                answer_text = answer.get("text", "") if isinstance(answer, dict) else str(answer)
                conversation_history.append({"role": "user", "parts": [answer_text]})

        # ✅ Append current (new) answer
        conversation_history.append({
            "role": "user",
            "parts": [data.answer_text]
        })

        # 🔁 Generate next question using conversation history
        next_question_text = await generate_next_question(
            interview_data['role'],
            interview_data['experience'],
            conversation_history # This is now correctly formatted for Gemini
        )

        print(f"[INFO] Next question: {next_question_text}")

        # ✅ Update Firestore
        updated_answers = answers + [{
            "text": data.answer_text,
            "timestamp": datetime.utcnow().isoformat(),
            "from_ai": False
        }]

        updated_evaluations = interview_data.get("evaluation", []) + [{
            "question": data.question_text,
            "answer": data.answer_text,
            "feedback": evaluation_feedback_dict, # Store the full feedback dictionary
            "timestamp": datetime.utcnow().isoformat()
        }]

        updated_questions = questions + [{
            "text": next_question_text,
            "timestamp": datetime.utcnow().isoformat(),
            "from_ai": True
        }]

        await asyncio.to_thread(interview_ref.update, {
            "answers": updated_answers,
            "evaluation": updated_evaluations,
            "questions": updated_questions,
            "updated_at": firestore.SERVER_TIMESTAMP
        })

        # Get suggestions for improvement string and replace '*' with '\n*'
        suggestions_text = evaluation_feedback_dict.get('suggestions_for_improvement', '')
        # Ensure each bullet point is on a new line for markdown rendering
        # This handles cases where Gemini might return " * Item1 * Item2" or "Item1. * Item2"
        # We want to ensure a newline precedes each bullet.
        if suggestions_text:
            # Replace common patterns for list items to ensure they start on a new line for markdown
            # This is a bit of a heuristic; ideally, the AI would generate perfect markdown.
            # Here we ensure each '*' starts on a new line.
            suggestions_text = re.sub(r'\*\s*', '\n* ', suggestions_text).strip()
            if not suggestions_text.startswith('*'): # Ensure the first item also gets a bullet if missing
                suggestions_text = '* ' + suggestions_text
            suggestions_text = suggestions_text.replace('\n* * ', '\n* ') # Fix double bullets if they occur
            suggestions_text = suggestions_text.replace('\n\n*', '\n*') # Avoid double newlines if it's already list-like
            suggestions_text = suggestions_text.replace('. *', '.\n*') # Ensure new line after a sentence ending period before a bullet

        # Create a display-friendly string from the structured feedback for immediate frontend use
        display_feedback_str = (
            f"**Correctness:** {evaluation_feedback_dict.get('correctness', 'N/A')}\n"
            f"**Depth:** {evaluation_feedback_dict.get('depth', 'N/A')}\n"
            f"**Relevance:** {evaluation_feedback_dict.get('relevance', 'N/A')}\n"
            f"**Score:** {evaluation_feedback_dict.get('score', 'N/A')}/10\n\n"
            f"**Detailed Feedback:**\n{evaluation_feedback_dict.get('detailed_feedback', '')}\n\n"
            f"**Suggestions for Improvement:**\n{suggestions_text}" # Use the formatted suggestions_text
        ).strip()

        return {
            "message": "Answer submitted and next question generated successfully",
            "next_question": next_question_text,
            "evaluation_feedback": evaluation_feedback_dict, # Keep the structured dict
            "display_feedback": display_feedback_str # Add the display-friendly string
        }

    except Exception as e:
        print(f"[ERROR] Error processing answer: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/end", response_model=InterviewEndResponse)
async def end_interview(interview_id: str, user_data: dict = Depends(get_current_user_data)):
    user_uid = user_data['uid']
    interview_ref = db.collection('interviews').document(interview_id)

    try:
        interview_doc = await asyncio.to_thread(interview_ref.get)
        if not interview_doc.exists:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Interview not found.")

        interview_data = interview_doc.to_dict()

        if interview_data.get('user_uid') != user_uid:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to end this interview.")

        if not interview_data.get('is_active', False):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Interview is not active or already ended.")

        overall_feedback_data_for_ai = {
            "role": interview_data.get('role', 'N/A'),
            "experience": interview_data.get('experience', 'N/A'),
            "questions": []
        }

        questions = interview_data.get('questions', [])
        answers = interview_data.get('answers', [])
        evaluations = interview_data.get('evaluation', [])

        # Ensure we only process up to the number of answered questions
        num_answered_questions = min(len(questions), len(answers), len(evaluations))

        for i in range(num_answered_questions):
            question_text = questions[i].get('text', 'N/A')
            answer_text = answers[i].get('text', 'N/A')
            
            # Access 'feedback' which is now a dictionary, and extract 'detailed_feedback' or a default.
            evaluation_feedback_item = evaluations[i].get('feedback', {})
            
            # For overall feedback, we'll still send a string summary of the evaluation feedback.
            # You might want to adjust this if the overall feedback model also needs the structured data.
            eval_summary = (
                f"Correctness: {evaluation_feedback_item.get('correctness', 'N/A')}, "
                f"Depth: {evaluation_feedback_item.get('depth', 'N/A')}, "
                f"Relevance: {evaluation_feedback_item.get('relevance', 'N/A')}, "
                f"Score: {evaluation_feedback_item.get('score', 'N/A')}/10.\n"
                f"Detailed Feedback: {evaluation_feedback_item.get('detailed_feedback', '')}\n"
                f"Suggestions: {evaluation_feedback_item.get('suggestions_for_improvement', '')}"
            ).strip()

            overall_feedback_data_for_ai['questions'].append({
                "question": question_text,
                "user_answer": answer_text,
                "evaluation_feedback": eval_summary # Send string summary for overall feedback generation
            })

        # Ensure generate_overall_feedback is awaited as it uses a synchronous model call
        raw_feedback_text = await asyncio.to_thread(generate_overall_feedback, overall_feedback_data_for_ai)
        structured_feedback = format_overall_feedback(raw_feedback_text)

        await asyncio.to_thread(interview_ref.update, {
            'is_active': False,
            'ended_at': datetime.utcnow(),
            'overall_feedback': structured_feedback
        })

        return InterviewEndResponse(
            message="Interview ended successfully.",
            overall_feedback=structured_feedback
        )

    except Exception as e:
        print(f"[ERROR] Error ending interview {interview_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to end interview: {str(e)}"
        )