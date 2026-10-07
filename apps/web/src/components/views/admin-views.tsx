import Link from 'next/link';
import type { ReactNode } from 'react';
import type {
  HouseholdDetailView,
  HouseholdsOverviewView,
  MemberAccessView,
} from '@/lib/contracts';
import type { Dictionary, Locale } from '@/lib/i18n/dictionary';
import {
  AddMemberForm,
  AdminToggle,
  EmailForm,
  HouseholdSettingsForm,
  InvitationForm,
  NewHouseholdForm,
  RemoveWhatsAppButton,
  RevokeAccessButton,
  WhatsAppForm,
} from '../admin/admin-forms';
import { Icon } from '../icons';
import { Badge, Empty, PageHeading, Panel } from '../ui';

type Access = keyof Dictionary['admin']['access'];

function accessOf(member: MemberAccessView): Access {
  if (member.hasPassword) {
    return 'PASSWORD';
  }
  return member.hasInvitation ? 'INVITED' : 'NONE';
}

const ACCESS_TEXT: Record<Access, string> = {
  PASSWORD: 'text-kept',
  INVITED: 'text-caution',
  NONE: 'text-muted',
};

function Initial({ name }: { readonly name: string }): ReactNode {
  return (
    <span
      aria-hidden="true"
      className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brass/15 font-display text-lg text-brass"
    >
      {name.slice(0, 1)}
    </span>
  );
}

export function AdminHouseholdsView({
  data,
  locale,
  t,
}: {
  readonly data: HouseholdsOverviewView;
  readonly locale: Locale;
  readonly t: Dictionary;
}): ReactNode {
  return (
    <>
      <PageHeading title={t.admin.title} t={t}>
        <p className="eyebrow mt-3 text-brass">{t.admin.eyebrow}</p>
        <p className="mt-2 max-w-2xl text-muted">{t.admin.intro}</p>
      </PageHeading>
      <div className="space-y-8">
        {data.households.length === 0 ? null : (
          <ul className="grid gap-4 md:grid-cols-2">
            {data.households.map((household) => (
              <li key={household.key}>
                <Link
                  href={`/admin/${encodeURIComponent(household.key)}`}
                  aria-label={t.admin.open(household.name)}
                  className="group flex h-full flex-col gap-3 rounded-2xl border border-line bg-surface p-5 shadow-panel transition-colors hover:border-brass/50"
                >
                  <span className="flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block truncate font-display text-xl">{household.name}</span>
                      <span className="mt-0.5 block text-sm text-muted">
                        {household.currency} · {t.admin.locales[household.locale]} ·{' '}
                        {household.timezone}
                      </span>
                    </span>
                    <Icon
                      name="chevron-right"
                      className="mt-1.5 h-4 w-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5"
                    />
                  </span>
                  <span className="mt-auto flex flex-wrap items-center gap-2 text-sm text-ink-soft">
                    <span>{t.admin.people(household.memberCount)}</span>
                    {household.adminCount > 0 ? (
                      <Badge tone="neutral">{t.admin.admins(household.adminCount)}</Badge>
                    ) : null}
                    {household.isYours ? <Badge tone="kept">{t.admin.yours}</Badge> : null}
                    <span className="ml-auto text-xs text-muted">
                      {t.admin.createdOn(t.date(household.createdOn))}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Panel title={t.admin.newHousehold}>
          <NewHouseholdForm
            currencies={data.options.currencies}
            locales={data.options.locales}
            defaultTimezone={data.options.defaultTimezone}
            locale={locale}
          />
        </Panel>
      </div>
    </>
  );
}

function MemberCard({
  member,
  household,
  locale,
  t,
}: {
  readonly member: MemberAccessView;
  readonly household: string;
  readonly locale: Locale;
  readonly t: Dictionary;
}): ReactNode {
  const access = accessOf(member);
  return (
    <li className="py-6 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-3">
        <Initial name={member.name} />
        <div className="min-w-0 flex-1">
          <h3 className="flex flex-wrap items-center gap-2 font-medium">
            {member.name}
            {member.isYou ? <Badge tone="neutral">{t.admin.you}</Badge> : null}
            {member.isPlatformAdmin ? <Badge tone="kept">{t.admin.admin}</Badge> : null}
          </h3>
          <p className="mt-0.5 text-sm text-muted">
            {member.email ?? t.admin.noEmail} ·{' '}
            <span className={ACCESS_TEXT[access]}>{t.admin.access[access]}</span>
          </p>
        </div>
      </div>
      <div className="mt-5 grid gap-6 md:grid-cols-2">
        <div>
          <p className="eyebrow mb-1.5 text-muted">{t.admin.email}</p>
          <EmailForm
            household={household}
            member={member.key}
            email={member.email}
            locale={locale}
          />
        </div>
        <div>
          <p className="eyebrow mb-1.5 text-muted">{t.admin.whatsapp}</p>
          {member.whatsapp.length === 0 ? (
            <p className="mb-2 text-sm text-muted">{t.admin.noWhatsapp}</p>
          ) : (
            <ul className="mb-2 flex flex-wrap gap-2">
              {member.whatsapp.map((identity) => (
                <li
                  key={identity.key}
                  className="flex items-center gap-1 rounded-full border border-line bg-raised py-0.5 pl-3 pr-0.5 text-sm"
                >
                  <span className="figure">{identity.phoneNumber}</span>
                  <RemoveWhatsAppButton
                    household={household}
                    identity={identity.key}
                    phoneNumber={identity.phoneNumber}
                    locale={locale}
                  />
                </li>
              ))}
            </ul>
          )}
          <WhatsAppForm household={household} member={member.key} locale={locale} />
        </div>
      </div>
      <div className="mt-5 flex flex-wrap items-start gap-2">
        <InvitationForm
          household={household}
          member={member.key}
          name={member.name}
          locale={locale}
        />
        <AdminToggle
          household={household}
          member={member.key}
          isAdmin={member.isPlatformAdmin}
          locale={locale}
        />
        {access === 'NONE' && member.email === null ? null : (
          <RevokeAccessButton
            household={household}
            member={member.key}
            name={member.name}
            locale={locale}
          />
        )}
      </div>
    </li>
  );
}

export function AdminHouseholdView({
  data,
  locale,
  t,
}: {
  readonly data: HouseholdDetailView;
  readonly locale: Locale;
  readonly t: Dictionary;
}): ReactNode {
  return (
    <>
      <PageHeading title={data.name} t={t}>
        <p className="mt-3 text-sm">
          <Link
            href="/admin"
            className="inline-flex items-center gap-1.5 text-muted hover:text-ink"
          >
            <Icon name="chevron-left" className="h-3.5 w-3.5" />
            {t.admin.back}
          </Link>
        </p>
      </PageHeading>
      <div className="space-y-6">
        <Panel title={t.admin.members}>
          {data.members.length === 0 ? (
            <Empty>{t.admin.people(0)}</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {data.members.map((member) => (
                <MemberCard
                  key={member.key}
                  member={member}
                  household={data.key}
                  locale={locale}
                  t={t}
                />
              ))}
            </ul>
          )}
          <div className="mt-8 border-t border-line pt-6">
            <AddMemberForm household={data.key} locale={locale} />
          </div>
        </Panel>
        <Panel title={t.admin.settings} note={t.admin.currencyFixed(data.currency)}>
          <HouseholdSettingsForm
            household={data.key}
            name={data.name}
            timezone={data.timezone}
            current={data.locale}
            locales={data.options.locales}
            locale={locale}
          />
        </Panel>
      </div>
    </>
  );
}
