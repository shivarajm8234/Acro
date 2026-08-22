export interface GmailEmail {
  id: string;
  sender: string;
  senderEmail: string;
  subject: string;
  date: string;
  snippet: string;
  body: string;
  isAiProcessed: boolean;
  isImportant: boolean;
  category: 'Exam' | 'Placement' | 'Important Academic' | 'None';
  summary: string;
  actionItems: string;
  eventTitle?: string | null;
  eventDate?: string | null;
  eventTime?: string | null;
}



// Decode Gmail base64url content to plain text
export const decodeBase64 = (data: string): string => {
  let base64 = data.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  try {
    return decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
  } catch (e) {
    try {
      return atob(base64);
    } catch (err) {
      return '';
    }
  }
};

// Recursively traverse Gmail payload parts to find the message body
export const getBody = (payload: any): string => {
  if (payload.body && payload.body.data) {
    return decodeBase64(payload.body.data);
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      const body = getBody(part);
      if (body) return body;
    }
  }
  return '';
};

// Local Keyword-based Heuristics in case LLM is offline or fails to parse
export const processEmailHeuristic = (email: Omit<GmailEmail, 'isAiProcessed' | 'isImportant' | 'category' | 'summary' | 'actionItems' | 'eventTitle' | 'eventDate' | 'eventTime'>): GmailEmail => {
  const textToScan = `${email.subject} ${email.sender} ${email.snippet}`.toLowerCase();
  
  let isImportant = false;
  let category: 'Exam' | 'Placement' | 'Important Academic' | 'None' = 'None';
  let summary = email.snippet;
  let actionItems = 'None';

  const examKeywords = ['exam', 'test', 'quiz', 'datesheet', 'seating', 'hall ticket', 'admit card', 'examination', 'midterm', 'endsem', 'practicals', 'assessment'];
  const placementKeywords = ['placement', 'interview', 'job', 'career', 'hiring', 'internship', 'recruit', 'company visit', 'drive', 'shortlist', 'offer letter', 'resume submission'];
  const academicKeywords = ['deadline', 'registration', 'fee', 'dean', 'registrar', 'university', 'syllabus', 'course enrollment', 'submission', 'academic calendar', 'holiday notice', 'class schedule'];

  if (examKeywords.some(kw => textToScan.includes(kw))) {
    isImportant = true;
    category = 'Exam';
    summary = `Academic exam/test update regarding: ${email.subject}`;
    actionItems = 'Check syllabus and exam schedule details.';
  } else if (placementKeywords.some(kw => textToScan.includes(kw))) {
    isImportant = true;
    category = 'Placement';
    summary = `Campus placement/career opportunity: ${email.subject}`;
    actionItems = 'Review application eligibility and register/apply on time.';
  } else if (academicKeywords.some(kw => textToScan.includes(kw))) {
    isImportant = true;
    category = 'Important Academic';
    summary = `Important university academic update: ${email.subject}`;
    actionItems = 'Take note of official announcements and instructions.';
  }

  return {
    ...email,
    isAiProcessed: true,
    isImportant,
    category,
    summary,
    actionItems,
    eventTitle: null,
    eventDate: null,
    eventTime: null
  };
};

// Use the local or cloud AI inference engine to process the email context
export const processEmailWithAi = async (
  email: Omit<GmailEmail, 'isAiProcessed' | 'isImportant' | 'category' | 'summary' | 'actionItems' | 'eventTitle' | 'eventDate' | 'eventTime'>,
  runAiInference: (prompt: string) => Promise<{ response: string }>
): Promise<GmailEmail> => {
  const prompt = `System Instructions: You are Acro AI's Academic Mail Classifier.
Analyze the following email details:
Sender: ${email.sender} (${email.senderEmail})
Subject: ${email.subject}
Date: ${email.date}
Snippet: ${email.snippet}
Body: ${email.body}

Evaluate if this email belongs to one of these categories:
- Exam (Exams, tests, quizzes, datesheets, hall tickets, seating arrangements)
- Placement (Placement drives, job openings, interviews, internship opportunities, company talks)
- Important Academic (Important notifications from dean, registrar, fee deadlines, course registrations, official university announcements)

Determine:
1. Is it important? (MUST belong to one of the 3 categories above to be true. Otherwise false. General newsletters, marketing, social, casual emails, personal discussions, updates about general topics should be false).
2. Category: "Exam", "Placement", "Important Academic", or "None".
3. Summary: A concise, clear 1-sentence summary of the email.
4. Action Items: List 1-2 urgent actions needed from the student (e.g., "Apply by Aug 25", "Check syllabus"), or "None" if there are none.
5. If there is a specific date and time for an event, exam, deadline, or interview mentioned, extract them.

Format your output strictly as a JSON object:
{
  "isImportant": true,
  "category": "Exam",
  "summary": "...",
  "actionItems": "...",
  "eventTitle": "Name of the event or deadline (or null if none)",
  "eventDate": "YYYY-MM-DD (format as YYYY-MM-DD, or null if none)",
  "eventTime": "HH:MM (format as 24-hour HH:MM, or null if none)"
}
Do not write any other text or explanation. Output only the valid JSON.`;

  try {
    const aiResult = await runAiInference(prompt);
    const responseText = aiResult.response || '';
    
    // Find JSON boundaries
    const jsonStart = responseText.indexOf('{');
    const jsonEnd = responseText.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd !== -1) {
      const jsonStr = responseText.substring(jsonStart, jsonEnd + 1);
      const parsed = JSON.parse(jsonStr);
      
      return {
        ...email,
        isAiProcessed: true,
        isImportant: !!parsed.isImportant,
        category: ['Exam', 'Placement', 'Important Academic'].includes(parsed.category) ? parsed.category : 'None',
        summary: parsed.summary || email.snippet,
        actionItems: parsed.actionItems || 'None',
        eventTitle: parsed.eventTitle || null,
        eventDate: parsed.eventDate || null,
        eventTime: parsed.eventTime || null
      };
    }
  } catch (err) {
    console.warn('Failed to classify email using AI, fallback to heuristic', err);
  }

  // Fallback to local keyword-based heuristic on failure
  return processEmailHeuristic(email);
};
