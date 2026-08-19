import { prisma, Prisma } from '@qa/db';
import { AssemblyAIClient } from '@qa/transcribe';
import { enqueueScore, type TranscribeJob } from '@qa/pipeline';
import { config } from '../env';
import { getRecording } from '../storage';

export async function runTranscribe(job: TranscribeJob): Promise<void> {
  if (!config.ASSEMBLYAI_API_KEY) {
    console.warn('[transcribe] ASSEMBLYAI_API_KEY not set — skipping.');
    return;
  }
  const interaction = await prisma.interaction.findUnique({ where: { id: job.interactionId } });
  if (!interaction) throw new Error(`Interaction ${job.interactionId} not found`);
  if (!interaction.recordingKey) throw new Error(`Interaction ${job.interactionId} has no recording`);

  await prisma.interaction.update({ where: { id: interaction.id }, data: { status: 'TRANSCRIBING' } });

  try {
    const bytes = await getRecording(interaction.recordingKey);
    const aai = new AssemblyAIClient(config.ASSEMBLYAI_API_KEY);
    const result = await aai.transcribeBytes(bytes, { direction: interaction.direction, redactPii: true });

    await prisma.transcript.upsert({
      where: { interactionId: interaction.id },
      create: {
        interactionId: interaction.id,
        provider: 'assemblyai',
        providerRef: result.providerRef,
        fullText: result.fullText,
        utterances: result.utterances as unknown as Prisma.InputJsonValue,
        redactionApplied: result.redactionApplied,
      },
      update: {
        providerRef: result.providerRef,
        fullText: result.fullText,
        utterances: result.utterances as unknown as Prisma.InputJsonValue,
        redactionApplied: result.redactionApplied,
      },
    });

    await prisma.interaction.update({
      where: { id: interaction.id },
      data: { status: 'TRANSCRIBED', statusError: null },
    });
    await enqueueScore({ interactionId: interaction.id });
    console.log(`[transcribe] ${interaction.id} → transcribed (${result.utterances.length} utterances)`);
  } catch (err) {
    await prisma.interaction.update({
      where: { id: interaction.id },
      data: { status: 'FAILED', statusError: String(err) },
    });
    throw err;
  }
}
