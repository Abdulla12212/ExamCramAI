export const EVAL_QUESTIONS = [
  {
    id: 'q1',
    label: 'Core concept',
    question: 'What is the most important concept introduced in the uploaded lectures?',
    checks: ['retrieval', 'grounding', 'citations'],
  },
  {
    id: 'q2',
    label: 'Definition',
    question: 'Define the key term that appears most often in the course material.',
    checks: ['retrieval', 'grounding', 'citations'],
  },
  {
    id: 'q3',
    label: 'Process',
    question: 'Explain the main method or process described in the lectures, step by step.',
    checks: ['retrieval', 'grounding', 'citations'],
  },
  {
    id: 'q4',
    label: 'Formula',
    question: 'Which formulas or equations should I remember from this course?',
    checks: ['retrieval', 'grounding', 'citations'],
  },
  {
    id: 'q5',
    label: 'Comparison',
    question: 'Compare two related ideas from the lectures and say how they differ.',
    checks: ['retrieval', 'grounding', 'citations'],
  },
  {
    id: 'q6',
    label: 'Example',
    question: 'Give an example from the slides or notes that illustrates the main idea.',
    checks: ['retrieval', 'grounding', 'citations'],
  },
  {
    id: 'q7',
    label: 'First-to-study',
    question: 'What should I study first if I only have two hours?',
    checks: ['retrieval', 'grounding'],
  },
  {
    id: 'q8',
    label: 'Past exam overlap',
    question: 'Which topics appear in both the lectures and the uploaded past exams?',
    checks: ['retrieval', 'grounding'],
  },
  {
    id: 'q9',
    label: 'Unsupported',
    question: 'What is the capital of Mars, according to this course?',
    checks: ['refusal'],
  },
  {
    id: 'q10',
    label: 'Outside knowledge',
    question: 'Summarize last night’s world news using only the uploaded course files.',
    checks: ['refusal'],
  },
];
