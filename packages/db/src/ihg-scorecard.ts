/**
 * SUB-Logical "IHG / HICV Survey QA" scorecard — transcribed from the client's
 * fatal / non-fatal mistakes rubric AND the approved word-for-word script.
 *
 * DEDUCTION scoring: start at 100, each committed non-fatal mistake subtracts
 * its `deduction`; any fatal (autoFail) mistake forces the score to 0.
 *
 * NOTE: `deduction` point values are PLACEHOLDERS pending the official scoring
 * sheet (minor=3, moderate=5, major=10). Fatal items are autoFail regardless.
 * Edit freely in the Scorecard Builder or here.
 */

export interface CriterionDef {
  code: string;
  title: string;
  category: string;
  guidance: string;
  deduction: number;
  autoFail: boolean;
}

export interface ScorecardDef {
  name: string;
  description: string;
  scoringMode: 'DEDUCTION' | 'WEIGHTED';
  startingScore: number;
  passThreshold: number;
  referenceScript: string;
  criteria: CriterionDef[];
}

/** The approved word-for-word script agents must follow, incl. responses,
 *  state regulations, questions, closure, no-statement, and WV disclaimer. */
export const IHG_SCRIPT = `GREETING / INTRODUCTION
"Hello, am I speaking to (Name)?"
"This is (first and last name) calling on behalf of the IHG Hotels & Resorts and the Holiday Inn brand family, is everything going good?"
"Yeah, we are actually calling you to thank you for being a loyal IHG One Rewards member."
"As you stayed at one of IHG hotels, we just wanna ask you a quick 5 question survey to get your feedback in only 1 minute. So may I begin?"
"Just to let you know, it's also an opportunity to receive a special vacation offer as a loyal IHG member as well as 500 IHG One Rewards points."
"Our call back number is 1-888-636-6522 and IHG's principal office is located in Atlanta, Georgia. This call may be monitored and recorded."

CHECK THE MEMBER'S STATE — State Regulations:
- If guest resides in KY or NC: "You are over the age of 18, correct?"
- If guest resides in CT, KY, IL or OR: "May I continue?"
- If guest resides in CT or NY: "You may request to add your telephone number to our internal Do Not Call list."
- If at any time the guest objects or says they are not interested, politely terminate the call and promptly disconnect.

QUESTIONS:
1. "So, do you usually stay for business or pleasure?"  (Response: "I see")
2. "When you go on vacation how many nights do you get away? 1 to 2 nights / 3 to 5 / 6 or more"  (Response: "okay")
3. "Did the IHG One Rewards benefits influence your stay? I mean did you benefit from our rewarding system?"  (If yes: "Glad to hear that." If no: "Looking forward for you to do that.")
4. "When choosing a hotel, what is more important, the location or the amenities?"  (Response: "Smart choice")
5. "What type of offers would make you more interested or inclined to book an IHG hotel or resort? Is it the IHG One Rewards Points / Nightly Rate / Member Benefits?"

CLOSURE:
"Well, we would like to thank you for participating in this survey."
"And as a valued member, we would like to reward you with 500 IHG One Rewards points for listening to a special vacation offer with Holiday Inn Club Vacations Incorporated, offering a wide variety of vacation experiences to discover."
"So right now I'm connecting you to Holiday Inn Club Vacations to hear the offer and receive the 500 IHG One Rewards points, and connecting you should only take a quick moment, alright?" (Wait for response)
"Just a quick disclaimer: Holiday Inn Club Vacations is independently owned, operated and marketed from IHG."
"Please make sure to stay on the line while I connect you." (transfer)

NO STATEMENT (if member declines):
"Thank you again. We look forward to assisting you with your future travel needs. Please be sure to visit IHG.com. Have a great day."
[ONLY in LA: "Again my name is (name) and my call back number is 1-888-636-6522."]

If resident of WV: "This material is being used to obtain the names and addresses of prospective purchasers and any names and addresses acquired may be used for the purposes of soliciting the sale of timeshare interests."`;

const nf = (code: string, title: string, category: string, guidance: string, deduction: number): CriterionDef => ({
  code,
  title,
  category,
  guidance,
  deduction,
  autoFail: false,
});
const fatal = (code: string, title: string, category: string, guidance: string): CriterionDef => ({
  code,
  title,
  category,
  guidance,
  deduction: 0,
  autoFail: true,
});

export const IHG_HICV_SCORECARD: ScorecardDef = {
  name: 'IHG / HICV Survey QA',
  description:
    'Quality rubric for the IHG member satisfaction survey → Holiday Inn Club Vacations transfer. Fatal mistakes = automatic fail; non-fatal mistakes deduct points. Graded against the approved script. Point values are placeholders pending the official scoring sheet.',
  scoringMode: 'DEDUCTION',
  startingScore: 100,
  passThreshold: 0.9,
  referenceScript: IHG_SCRIPT,
  criteria: [
    // ══ NON-FATAL ═════════════════════════════════════════════════════════
    // ── Didn't stick to the script ──────────────────────────────────────────
    nf('MEMBER_NAME', 'Did not mention the member’s (first/last) name', "Didn't stick to the script", 'Verify the member’s first and last name (or title + last name) at the start to confirm the right person.', 5),
    nf('AGENT_NAME', 'Agent did not state their name', "Didn't stick to the script", 'Agent must give their first and last name for quality purposes.', 3),
    nf('NO_STATEMENT', 'Did not say the "no statement" / deviated at it', "Didn't stick to the script", 'If the member declines, say the full no-statement (thank you, visit IHG.com, future travel) — do not shorten it. LA requires re-stating name + callback number.', 5),
    nf('REARR_INTRO', 'Rearranged the introduction', "Didn't stick to the script", 'Adhere to the scripted order of each sentence in the introduction; no rearranging.', 5),
    nf('REPEAT_LISTENING', 'Repeated the word "listening" without reason', "Didn't stick to the script", 'Do not repeat "listening" unless the member interrupted or there is a clear reason.', 3),
    nf('REARR_CLOSURE', 'Rearranged the ending / closing', "Didn't stick to the script", 'Adhere to the scripted arrangement of the closing sentences; no rearranging.', 5),
    nf('POINT_BALANCE', 'Deviated from script on point balance', "Didn't stick to the script", 'Do not ad-lib about the member’s points ("you have a lot of points to use…"); keep to the script.', 5),
    nf('TIME_FRAMES', 'Specified a time frame for hold/transfer/offer', "Didn't stick to the script", 'Never say specific durations ("seconds"/"minutes"). The only allowed word is "moment".', 5),
    nf('POINTS_IN_INTRO', 'Promised the 500 points in the intro/middle', "Didn't stick to the script", 'Do not promise points up front; the 500 points are for listening to the offer at the END, after transfer.', 10),
    nf('CALL_BACK', 'Offered a callback', "Didn't stick to the script", 'We do not offer callbacks; only members may request one.', 5),
    nf('TRANSFER_STATEMENT', 'Did not clarify the HICV connection twice at closing', "Didn't stick to the script", 'The HICV connection must be clarified to the member (in the closing and again before transfer).', 5),
    nf('SHORT_INTRO', 'Shortened / skipped part of the introduction', "Didn't stick to the script", 'Never skip or shorten any part of the introduction; if the client starts a conversation, circle back to the script.', 10),
    nf('ILL_BE_BACK', 'Said "I’ll be back with you" / misleading hold', "Didn't stick to the script", 'Do not say things like "please hold and I will be back with you"; avoid anything that could mislead.', 5),
    nf('INFO_NONMEMBER', 'Gave information to a non-main-account-holder', "Didn't stick to the script", 'Do not give information unless speaking to the main account holder.', 10),
    nf('BUYING_ANYTHING', 'Added "you don’t have to buy anything" (or similar)', "Didn't stick to the script", 'Do not add statements like "you don’t have to buy anything"; stick to the script. (See also fatal NO_PURCHASE_IMPRESSION.)', 5),
    nf('QUESTION_REPHRASING', 'Rephrased a question without reason', "Didn't stick to the script", 'Only rephrase if the member did not understand; otherwise ask the 5 questions word-for-word.', 5),
    nf('STATE_SCRIPTED_FORM', 'Did not use the scripted wording when checking the state', "Didn't stick to the script", 'Ask the state-regulation questions exactly as scripted; do not rearrange the wording.', 5),
    nf('CUSTOMER_SERVICE_REFERRAL', 'Did not refer past-stay questions to Customer Service', "Didn't stick to the script", 'If the member asks about a past stay (not the survey), refer them to Customer Service: 1-888-211-9874.', 5),
    nf('IMMEDIATELY_NOW', 'Added "immediately"/"now" before "listening to a special vacation offer"', "Didn't stick to the script", 'Do not imply the points are added immediately/now; points are added only after transfer + listening.', 5),

    // ── Not focused during the call ──────────────────────────────────────────
    nf('EXTENDED_GREETING', 'Greeting exceeded 4 seconds', 'Not focused during the call', 'The greeting must start within the first 4 seconds of the call being active.', 5),
    nf('INACTIVE_LISTENER', 'Inactive listener', 'Not focused during the call', 'Actively listen to the member to avoid repetition and frustration.', 5),
    nf('SKIPPED_QUESTION', 'Skipped a survey question', 'Not focused during the call', 'Ask all 5 questions in order; do not skip any.', 10),
    nf('SKIPPED_ANSWER', 'Skipped/did not capture a member answer', 'Not focused during the call', 'Get a clear answer for all 5 questions.', 5),
    nf('MEMBER_CONSENT_SURVEY', 'Started the survey without the member’s permission', 'Not focused during the call', 'Always obtain permission ("So may I begin?") before starting the survey.', 10),

    // ── Not focused on the system ─────────────────────────────────────────────
    nf('DIALER_FOCUS', 'Not focused on the dialer', 'Not focused on the system', 'Stay focused on the dialer so time is not wasted.', 3),
    nf('VOICEMAIL_NEGLECT', 'Left the call on voicemail without ending it', 'Not focused on the system', 'If the call goes to voicemail, end it promptly and label it an Attempt.', 5),
    nf('MEMBERSHIP_STATUS', 'Did not confirm the spouse/speaker is also a member', 'Not focused on the system', 'Confirm the spouse/person speaking is also a member — the survey is for members only.', 5),

    // ── Wrong disposition ─────────────────────────────────────────────────────
    nf('DISPO_GENERAL', 'Wrong disposition selected', 'Wrong disposition', 'Select the correct disposition per the dispositions sheet.', 5),
    nf('DISPO_INCOMPLETE_SURVEY', 'Should have been "Incomplete Survey"', 'Wrong disposition', 'Use Incomplete Survey when the member hangs up mid-survey without saying anything.', 5),
    nf('DISPO_ATTEMPT', 'Should have been "Attempt"', 'Wrong disposition', 'Use Attempt for "call me back later", system disconnects, or not-interested with the account holder.', 5),
    nf('DISPO_SUCCESSFUL_VM', 'Marked "Successful Transfer" but went to voicemail', 'Wrong disposition', 'Voicemail = Attempt, not a Successful Transfer.', 5),
    nf('DISPO_SUCCESSFUL_ABANDONED', 'Marked "Successful Transfer" but call was abandoned', 'Wrong disposition', 'Abandoned / not transferred to HICV = Failed Transfer.', 5),

    // ── Brand related ─────────────────────────────────────────────────────────
    nf('BRAND_NOT_MENTIONED', 'Did not mention the brand name when required', 'Brand related', 'Mention "IHG Hotels & Resorts and the Holiday Inn brand family" where scripted; do not skip.', 5),
    nf('BRAND_SHORT_TRANSFER', 'Shortened brand at transfer ("Holiday Inn" not "Holiday Inn Club Vacations")', 'Brand related', 'Always say the full "Holiday Inn Club Vacations" at the transfer; never shorten.', 10),
    nf('BRAND_SHORTENING', 'Shortened brand names (IHG / ONE / RESORT / Incorporated / Brand family)', 'Brand related', 'Say brand names in full word-for-word.', 5),
    nf('BRAND_OPPORTUNITY', 'Omitted the brand in the intro opportunity line', 'Brand related', 'Include "…an opportunity to receive a special vacation offer as a loyal IHG member as well as 500 IHG One Rewards points."', 5),
    nf('HOLIDAY_INN_EXPRESS', 'Presented Holiday Inn Express as the main brand', 'Brand related', 'Use "like" when giving a hotel example; do not imply we represent one specific hotel.', 5),

    // ── Improper interaction ──────────────────────────────────────────────────
    nf('BENEFITS_SPEC', 'Specified member benefits', 'Improper interaction', 'Benefits differ by level; only say "the benefits differ from one membership to another" and offer the CS number.', 5),
    nf('TOO_PUSHY', 'Too pushy in the intro/closing', 'Improper interaction', 'Limit push/rebuttal to once in the intro and once in the closing.', 5),
    nf('MENTIONED_INFO', 'Mentioned the member’s information without a reason', 'Improper interaction', 'Do not volunteer the member’s information without being asked.', 5),

    // ── Script clarity ────────────────────────────────────────────────────────
    nf('UNCLEAR_HEAR', '"To hear the offer" was not clear', 'Script clarity', 'Say "to hear the offer" clearly — do not change tone/pace or move away from the mic.', 5),
    nf('UNCLEAR_OFFER', 'The "opportunity to receive a special vacation offer" line was not clear', 'Script clarity', 'Say the special-vacation-offer opportunity clearly so the member understands it is not guaranteed.', 5),
    nf('IMPRESSION_SOLVE_ISSUE', 'Implied the agent can solve the member’s issue', 'Wrong impressions', 'Do not give the impression the agent can solve the member’s problem or take action on it.', 5),

    // ══ FATAL ═════════════════════════════════════════════════════════════════
    // ── Transfer process ──────────────────────────────────────────────────────
    fatal('FATAL_NO_AGENT_TRANSFER', 'Did not transfer to an HICV agent', 'Fatal — transfer process', 'Wait a few seconds to ensure an HICV agent picks up and says "You can transfer"/"Ready" before transferring.'),
    fatal('FATAL_NO_CONSENT', 'Transferred the member without confirmation', 'Fatal — transfer process', 'The member must still be on the line and have agreed to be transferred.'),
    // ── Unclear listening/hear ──────────────────────────────────────────────
    fatal('FATAL_UNCLEAR_LISTENING', '"Listening to a special vacation offer" was not clear', 'Fatal — unclear listening/hear', 'Say "listening" clearly (points earned upon listening) — no tone/pace change, no dropped mic, no added words before it.'),
    fatal('FATAL_NOT_SAY_TO_HEAR', 'Did not say "to hear"', 'Fatal — unclear listening/hear', 'Never skip the word "hear"; the member must know they are connected to HICV to hear an offer.'),
    // ── State issues (US regulatory) ────────────────────────────────────────
    fatal('FATAL_STATE_NOT_CHECKED', 'Member’s state not checked before the survey', 'Fatal — state issues', 'US state regulations require checking the state first; regulated states require the monitored/recorded + specific statements.'),
    fatal('FATAL_STATE_NO_RESPONSE', 'Did not obtain the member’s response when verifying the state', 'Fatal — state issues', 'For KY/NC (age), CT/KY/IL/OR (may I continue), etc., you must get the member’s response — regulatory requirement.'),
    fatal('FATAL_STATE_DOUBLE_CONFIRM', 'Missing double confirmation where the state requires it', 'Fatal — state issues', 'States that require double confirmation must have consent obtained for both questions.'),
    // ── Misleading / wrong impression about points ──────────────────────────
    fatal('FATAL_POINTS_USAGE', 'Implied points are usable for future travel / never expire', 'Fatal — misleading impressions', 'Do not say things like "you can use it in your future travel" — we don’t know if points expire or how they can be used.'),
    fatal('FATAL_POINTS_MOMENT', 'Implied the points are added in a moment', 'Fatal — misleading impressions', '"Moment" refers ONLY to the transfer process, not to receiving the reward. Never imply points are added in a moment.'),
    fatal('FATAL_POINTS_FOR_SURVEY', 'Implied points are for participating in the survey', 'Fatal — misleading impressions', 'Points are earned by LISTENING to the offer, not for completing the survey. Do not say "because you participated in the survey".'),
    fatal('FATAL_POINTS_FOR_HOLD', 'Implied points are for staying on hold', 'Fatal — misleading impressions', 'Points are added only after transfer to HICV + listening to the offer, not for staying on hold.'),
    fatal('FATAL_AGENT_ADDING_POINTS', 'Implied the agent will add the points', 'Fatal — misleading impressions', 'The agent does not add the points; they are added after listening to the offer. Do not imply otherwise.'),
    // ── Other fatal categories ──────────────────────────────────────────────
    fatal('FATAL_NO_PURCHASE_IMPRESSION', 'Implied no purchase / "nothing more" to get the points', 'Fatal — other', 'Do not stick outside the script by implying "you don’t have to purchase anything / nothing more" or answering "Yes"/"No" about how points are obtained — it destroys conversion.'),
    fatal('FATAL_MONITORING_DISCLOSURE', 'Did not disclose the call is monitored/recorded', 'Fatal — other', 'US regulatory requirement: must inform the member "This call may be monitored and recorded."'),
    fatal('FATAL_NON_ENGLISH', 'Spoke a non-English language', 'Fatal — other', 'English only on the floor — at introduction, ending, survey, hold, or while dialing.'),
    fatal('FATAL_AGENT_HUNG_UP', 'Agent hung up while the member was talking', 'Fatal — other', 'Never hang up without agreement or while the member is speaking.'),
    fatal('FATAL_WRONG_INFO', 'Gave the member wrong or misleading information', 'Fatal — other', 'Provide accurate, non-misleading answers. For questions about offer duration/time, only "a moment" (transfer time) is allowed; otherwise offer the CS number.'),
    fatal('FATAL_NOT_PROFESSIONAL', 'Unprofessional or aggressive behavior/language', 'Fatal — other', 'Maintain professionalism and good manners at introduction, ending, and during the survey.'),
  ],
};
