# Pedagogy Guide

## Bloom's 2-Sigma Effect

Benjamin Bloom (1984) found that students tutored 1-on-1 with mastery learning performed 2 standard deviations above conventional classroom students. The two key ingredients:

1. **Mastery learning**: Don't advance until the current unit is truly understood
2. **1-on-1 tutoring**: Adapt pace, style, and content to the individual learner

## Socratic Method Integration

Never lecture. Instead:
- Ask questions that lead the learner to discover the answer
- When they're stuck, don't explain — ask a simpler question
- When they answer correctly, don't just confirm — ask them to explain why

## Question Design Patterns

### Diagnostic Questions (Step 1)

Purpose: Quickly map what the learner knows and doesn't know.

| Type | Example | Probes |
|------|---------|--------|
| Vocabulary check | "What does [term] mean to you?" | Do they know the words? |
| Concept sorting | "Which of these are examples of X?" (AskUserQuestion) | Can they categorize? |
| Prediction | "What do you think happens when...?" | Intuition level |
| Explain-back | "Explain [concept] as if to a 10-year-old" | Depth of understanding |

### Teaching Questions (Step 3)

| Pattern | When | Example |
|---------|------|---------|
| **Predict** | Introducing new behavior | "What will this code print?" |
| **Compare** | Distinguishing similar concepts | "How is X different from Y?" |
| **Debug** | Testing careful reading | "This code has a bug. Can you find it?" |
| **Extend** | Testing transfer | "Now how would you modify this to also handle...?" |
| **Teach-back** | Confirming mastery | "Explain to me how [concept] works" |
| **Connect** | Building knowledge graph | "How does [new concept] relate to [previous concept]?" |

### Mastery Check Questions (Step 3g)

These should be synthesis-level:
- Combine the current concept with 1-2 previous concepts
- Require application, not just recall
- Include at least one novel scenario not seen during teaching

### Interleaving Questions (Step 3b)

Interleaving means mixing questions about old concepts into the current learning flow. Research (Rohrer & Taylor 2007, Dunlosky et al. 2013) shows interleaved practice improves long-term retention by ~43% compared to blocked practice.

**Why it works**: Interleaving forces the learner to discriminate between concepts ("which tool applies here?"), which is a higher cognitive demand than applying a known concept. This discrimination practice is what builds durable, flexible knowledge.

**How to design interleaving questions**:
- The question must require BOTH the old concept and the current concept
- Don't announce it as review — embed it naturally
- Prioritize concepts that are easily confused with the current one
- If the learner fails the old-concept part, it's a signal the old concept is decaying — note it for spaced repetition

| Interleaving Pattern | Example |
|---------------------|---------|
| **Combine** | "Use both [old concept] and [new concept] to solve this" |
| **Discriminate** | "Would you use [old concept] or [new concept] here? Why?" |
| **Contrast** | "This looks similar to [old concept]. What's different?" |
| **Layer** | "We used [old concept] to do X. Now add [new concept] on top." |

## Mastery Scoring (Calibrated)

### Rubric-Based Assessment

Do NOT score based on vague impression. Use these 4 criteria for each mastery check question:

| Criterion | Weight | What to look for |
|-----------|--------|------------------|
| **Accurate** | 1 point | Factually/logically correct answer |
| **Explained** | 1 point | Learner articulates the WHY, not just the WHAT |
| **Novel application** | 1 point | Can apply to a scenario not seen during teaching |
| **Discrimination** | 1 point | Can distinguish from similar/related concepts |

Score per question = criteria met / 4. Concept mastery requires >= 3/4 on each mastery check question AND >= 80% overall concept score.

### Self-Assessment Calibration

Ask the learner to self-assess BEFORE revealing your evaluation. Compare:

| Self vs Rubric | What it means | Action |
|----------------|---------------|--------|
| Both high | Good metacognition, true mastery | Proceed to practice phase |
| Self HIGH, rubric LOW | **Fluency illusion** — most dangerous | Flag explicitly, show evidence of gaps |
| Self LOW, rubric HIGH | Under-confidence | Reassure with specific evidence |
| Both low | Honest awareness of gaps | Cycle back, adjust approach |

**Fluency illusion** (Bjork, 1994): The feeling of understanding that comes from familiarity rather than actual comprehension. Common triggers: seeing a worked example and thinking "I could do that", recognizing terminology without being able to apply it, confusing passive exposure with active mastery.

### Qualitative Signals

Beyond the rubric, these signals indicate genuine mastery:
- Learner can explain concept in their own words
- Learner can give novel examples
- Learner can identify errors in incorrect examples
- Learner can connect concept to broader context

## Misconception Handling

### Why Misconceptions Matter More Than Gaps

A gap in knowledge ("I don't know X") is easy to fill — just teach X. A misconception ("I know X, but my version of X is wrong") is far harder because the wrong model must be dismantled before the correct one can take hold. Research (Vosniadou 2013, Chi 2005) shows that misconceptions are the #1 barrier to learning in most domains.

### Types of Misconceptions

| Type | Example | Why it's sticky |
|------|---------|----------------|
| **Overgeneralization** | "All functions return values" | Correct in many cases, fails in edge cases |
| **False analogy** | "Electricity flows like water" | Useful at first, breaks down at depth |
| **Vocabulary confusion** | "Parameter and argument are the same" | Language reinforces the error daily |
| **Causal reversal** | "Practice makes talent" (vs talent enables practice) | Correlation mistaken for causation |
| **Incomplete model** | "Closures copy variables" (actually capture references) | Partially correct, fails under mutation |

### The Counter-Example Method

The most effective way to dislodge a misconception is NOT to say "that's wrong." It's to construct a scenario where the wrong model makes a clear, testable prediction — and then show reality contradicts it.

Steps:
1. **Identify** the wrong model from the learner's answer
2. **Construct** a scenario where the wrong model predicts outcome A
3. **Ask** the learner to predict the outcome (they'll predict A)
4. **Reveal** that the actual outcome is B
5. **Ask** the learner to explain the discrepancy
6. **Wait** — let the learner wrestle with the contradiction. Do NOT explain immediately.
7. **Guide** toward the correct model only after they've engaged with the contradiction

### Misconception Resolution Criteria

A misconception is resolved ONLY when BOTH conditions are met:
1. The learner explicitly states what was wrong about their old thinking
2. The learner correctly handles a new scenario that would have triggered the old misconception

Getting the right answer once is NOT enough — they must also articulate why the old answer was wrong.

## Spaced Repetition

### The Forgetting Curve

Ebbinghaus (1885) demonstrated that without review, memory decays exponentially:
- After 1 hour: ~50% forgotten
- After 1 day: ~70% forgotten
- After 1 week: ~90% forgotten

The only way to counteract this is **spaced review** — re-testing at increasing intervals.

### Interval Schedule

Sigma uses a simplified SM-2 inspired schedule:

| Event | Next Review Interval |
|-------|---------------------|
| Concept first mastered | 1 day |
| Review: correct | Double the interval (1d → 2d → 4d → 8d → 16d → 32d) |
| Review: incorrect | Reset to 1 day |
| Maximum interval | 32 days |

### Review Question Design

Review questions should be:
- **Brief**: 1 question per concept, not a full mastery check
- **Application-level**: Not "what is X?" but "use X to solve this small problem"
- **Connected**: Where possible, connect the review concept to the current concept being learned (this also serves as interleaving)

### Session Review Protocol

On `--resume`, before continuing new content:
1. Identify all mastered concepts where `days_since_review >= review_interval`
2. Sort by most overdue first
3. Review max 5 concepts per session (don't turn the session into all review)
4. Adjust intervals based on results
5. If a concept drops back to `in-progress`, address it before continuing forward

## Deliberate Practice

### Understanding ≠ Ability

Ericsson's research on expert performance (1993) established that knowing how something works is fundamentally different from being able to do it. The gap between declarative knowledge ("I can explain decorators") and procedural knowledge ("I can write a decorator") requires practice to bridge.

### Practice Task Design

Good practice tasks for Sigma:

| Property | Good | Bad |
|----------|------|-----|
| **Size** | 2-5 minutes | 30-minute project |
| **Scope** | Tests one concept | Tests everything at once |
| **Novelty** | New scenario, same concept | Repeat of a teaching example |
| **Output** | Learner produces something | Learner answers more questions |
| **Feedback** | Clear right/wrong signal | Ambiguous quality |

### Practice vs More Questions

Practice is NOT more Q&A. The key differences:

| Dimension | Questions (3b) | Practice (3h) |
|-----------|----------------|---------------|
| Mode | Reactive (answer what's asked) | Generative (produce something new) |
| Cognitive load | Recognition + recall | Planning + execution + self-monitoring |
| Output | Words | Artifact (code, design, example, explanation) |
| Feedback | Immediate from tutor | Self-discovered through doing |

### The Generation Effect

Slamecka & Graf (1978) showed that information the learner generates themselves is remembered 2-3x better than information they read. Practice tasks leverage this effect — the learner constructs knowledge through the act of doing.

## Adaptive Pacing

| Signal | Action |
|--------|--------|
| Answers quickly and correctly | Skip to harder questions, consider merging concepts |
| Answers correctly but slowly | Proceed normally, give time |
| Partially correct | Ask follow-up probing questions before moving on |
| Consistently wrong | Break down into sub-concepts, use more concrete examples |
| Frustrated | Switch to a visual aid, use analogy, acknowledge difficulty |
| Bored | Increase difficulty, introduce real-world application |

## Visual Aid Selection

Use the right format for the right purpose:

| Need | Format | When |
|------|--------|------|
| Show relationships | Excalidraw concept map | Concepts have dependencies or hierarchy |
| Walk through process | HTML step-by-step | Code execution, algorithm steps |
| Abstract idea | Generated image (nano-banana-pro) | Metaphors, mental models |
| Compare options | HTML table/grid | Feature comparison, trade-offs |
| Show flow/logic | Excalidraw flowchart | Decision trees, control flow |
| Summarize progress | HTML dashboard | Milestones, session end |

Don't generate visuals for every round — use them when they genuinely help understanding or when the learner seems stuck.
