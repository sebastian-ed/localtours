-- LocalTours Pro schema
-- Ejecutar en Supabase SQL editor

create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum ('traveler', 'provider_pending', 'provider', 'admin', 'super_admin');
  end if;
  if not exists (select 1 from pg_type where typname = 'listing_type') then
    create type public.listing_type as enum ('experience', 'accommodation');
  end if;
  if not exists (select 1 from pg_type where typname = 'booking_status') then
    create type public.booking_status as enum ('pending', 'confirmed', 'cancelled', 'completed');
  end if;
end $$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text unique,
  full_name text,
  company_name text,
  phone text,
  whatsapp text,
  website text,
  city text,
  bio text,
  avatar_url text,
  role public.app_role not null default 'traveler',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.touch_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  requested_role text;
  resolved_role public.app_role;
  has_super_admin boolean;
begin
  has_super_admin := exists(select 1 from public.profiles where role = 'super_admin');
  requested_role := coalesce(new.raw_user_meta_data ->> 'requested_role', 'traveler');

  if not has_super_admin then
    resolved_role := 'super_admin';
  elsif requested_role = 'provider' then
    resolved_role := 'provider_pending';
  else
    resolved_role := 'traveler';
  end if;

  insert into public.profiles (
    id,
    email,
    full_name,
    phone,
    role
  )
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.raw_user_meta_data ->> 'phone',
    resolved_role
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(nullif(excluded.full_name, ''), public.profiles.full_name),
        phone = coalesce(nullif(excluded.phone, ''), public.profiles.phone);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.handle_user_email_sync()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  update public.profiles
     set email = new.email
   where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated
after update of email on auth.users
for each row execute function public.handle_user_email_sync();

create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role from public.profiles where id = auth.uid()), 'traveler'::public.app_role);
$$;

create or replace function public.is_adminish()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_app_role() in ('admin', 'super_admin');
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_app_role() = 'super_admin';
$$;

create or replace function public.can_manage_owner(owner_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() = owner_id or public.is_adminish();
$$;

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text generated always as (
    lower(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g'))
  ) stored,
  created_at timestamptz not null default now()
);

create table if not exists public.listings (
  id uuid primary key default gen_random_uuid(),
  owner_provider_id uuid not null references public.profiles (id) on delete cascade,
  listing_type public.listing_type not null default 'experience',
  title text not null,
  slug text not null unique default ('listing-' || substring(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  summary text,
  description text,
  city text,
  country text default 'Argentina',
  address text,
  meeting_point text,
  duration_label text,
  languages text[] not null default '{}',
  highlights text[] not null default '{}',
  includes text[] not null default '{}',
  excludes text[] not null default '{}',
  itinerary text[] not null default '{}',
  faqs jsonb not null default '[]'::jsonb,
  price numeric(12,2) not null default 0,
  sale_price numeric(12,2),
  currency text not null default 'USD',
  cancellation_type text,
  capacity integer not null default 1,
  instant_confirmation boolean not null default true,
  featured boolean not null default false,
  published boolean not null default false,
  cover_image_url text,
  rating_avg numeric(4,2) not null default 0,
  rating_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_listings_updated_at on public.listings;
create trigger trg_listings_updated_at
before update on public.listings
for each row execute function public.touch_updated_at();

create table if not exists public.listing_categories (
  listing_id uuid not null references public.listings (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (listing_id, category_id)
);

create table if not exists public.listing_media (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  url text not null,
  alt_text text,
  sort_order integer not null default 1,
  created_at timestamptz not null default now()
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  booking_code text not null unique default ('BK-' || upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
  listing_id uuid not null references public.listings (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  provider_id uuid references public.profiles (id) on delete set null,
  travel_date date not null,
  travel_time time,
  guests integer not null default 1 check (guests > 0),
  unit_price numeric(12,2),
  total_amount numeric(12,2),
  status public.booking_status not null default 'pending',
  customer_name text,
  customer_email text,
  customer_phone text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_bookings_updated_at on public.bookings;
create trigger trg_bookings_updated_at
before update on public.bookings
for each row execute function public.touch_updated_at();

create or replace function public.set_booking_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  listing_row public.listings;
  final_price numeric(12,2);
begin
  select * into listing_row
  from public.listings
  where id = new.listing_id;

  if listing_row.id is null then
    raise exception 'listing not found';
  end if;

  final_price := coalesce(listing_row.sale_price, listing_row.price, 0);

  new.provider_id := listing_row.owner_provider_id;
  new.unit_price := coalesce(new.unit_price, final_price);
  new.total_amount := coalesce(new.total_amount, final_price * new.guests);

  return new;
end;
$$;

drop trigger if exists trg_bookings_defaults on public.bookings;
create trigger trg_bookings_defaults
before insert on public.bookings
for each row execute function public.set_booking_defaults();

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  booking_id uuid references public.bookings (id) on delete set null,
  rating integer not null check (rating between 1 and 5),
  title text,
  body text,
  is_approved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (listing_id, user_id)
);

drop trigger if exists trg_reviews_updated_at on public.reviews;
create trigger trg_reviews_updated_at
before update on public.reviews
for each row execute function public.touch_updated_at();

create or replace function public.refresh_listing_rating()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_listing uuid;
begin
  target_listing := coalesce(new.listing_id, old.listing_id);

  update public.listings l
     set rating_avg = coalesce((
       select round(avg(r.rating)::numeric, 2)
       from public.reviews r
       where r.listing_id = target_listing
         and r.is_approved = true
     ), 0),
         rating_count = (
       select count(*)
       from public.reviews r
       where r.listing_id = target_listing
         and r.is_approved = true
     )
   where l.id = target_listing;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_reviews_refresh_rating on public.reviews;
create trigger trg_reviews_refresh_rating
after insert or update or delete on public.reviews
for each row execute function public.refresh_listing_rating();

create table if not exists public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  listing_id uuid not null references public.listings (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, listing_id)
);

create view public.provider_public_profiles as
select
  id,
  full_name,
  company_name,
  whatsapp as provider_whatsapp,
  website as provider_website,
  city as provider_city,
  bio as provider_bio,
  avatar_url as provider_avatar_url
from public.profiles
where role in ('provider', 'admin', 'super_admin')
  and is_active = true;

create view public.listing_catalog as
select
  l.id,
  l.owner_provider_id,
  l.listing_type,
  l.title,
  l.slug,
  l.summary,
  l.city,
  l.country,
  l.duration_label,
  l.price,
  l.sale_price,
  l.currency,
  l.cancellation_type,
  l.capacity,
  l.instant_confirmation,
  l.featured,
  l.published,
  l.cover_image_url,
  l.rating_avg,
  l.rating_count,
  l.created_at,
  p.full_name as provider_name,
  p.company_name,
  p.provider_whatsapp,
  p.provider_website,
  p.provider_avatar_url,
  coalesce(array_remove(array_agg(distinct c.name), null), '{}') as category_names
from public.listings l
left join public.provider_public_profiles p on p.id = l.owner_provider_id
left join public.listing_categories lc on lc.listing_id = l.id
left join public.categories c on c.id = lc.category_id
where l.published = true
group by
  l.id,
  p.full_name,
  p.company_name,
  p.provider_whatsapp,
  p.provider_website,
  p.provider_avatar_url;

create view public.listing_detail_view as
select
  lc.*,
  pp.provider_bio,
  pp.provider_city
from public.listing_catalog lc
left join public.provider_public_profiles pp on pp.id = lc.owner_provider_id;

create view public.review_public_view as
select
  r.id,
  r.listing_id,
  r.rating,
  r.title,
  r.body,
  r.created_at,
  p.full_name,
  p.email
from public.reviews r
join public.profiles p on p.id = r.user_id
where r.is_approved = true;

create index if not exists idx_listings_owner on public.listings(owner_provider_id);
create index if not exists idx_listings_published on public.listings(published);
create index if not exists idx_bookings_user on public.bookings(user_id);
create index if not exists idx_bookings_provider on public.bookings(provider_id);
create index if not exists idx_reviews_listing on public.reviews(listing_id);
create index if not exists idx_favorites_user on public.favorites(user_id);

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.listings enable row level security;
alter table public.listing_categories enable row level security;
alter table public.listing_media enable row level security;
alter table public.bookings enable row level security;
alter table public.reviews enable row level security;
alter table public.favorites enable row level security;

drop policy if exists "profiles_self_or_admin_select" on public.profiles;
create policy "profiles_self_or_admin_select"
on public.profiles
for select
using (auth.uid() = id or public.is_adminish());

drop policy if exists "profiles_self_update" on public.profiles;
create policy "profiles_self_update"
on public.profiles
for update
using (auth.uid() = id or public.is_adminish())
with check (
  auth.uid() = id
  or public.is_adminish()
);

drop policy if exists "categories_public_select" on public.categories;
create policy "categories_public_select"
on public.categories
for select
using (true);

drop policy if exists "categories_admin_manage" on public.categories;
create policy "categories_admin_manage"
on public.categories
for all
using (public.is_adminish())
with check (public.is_adminish());

drop policy if exists "listings_public_or_owner_select" on public.listings;
create policy "listings_public_or_owner_select"
on public.listings
for select
using (published = true or public.can_manage_owner(owner_provider_id));

drop policy if exists "listings_provider_insert" on public.listings;
create policy "listings_provider_insert"
on public.listings
for insert
with check (
  (
    public.current_app_role() = 'provider'
    and owner_provider_id = auth.uid()
  )
  or public.is_adminish()
);

drop policy if exists "listings_owner_update" on public.listings;
create policy "listings_owner_update"
on public.listings
for update
using (public.can_manage_owner(owner_provider_id))
with check (public.can_manage_owner(owner_provider_id));

drop policy if exists "listings_owner_delete" on public.listings;
create policy "listings_owner_delete"
on public.listings
for delete
using (public.can_manage_owner(owner_provider_id));

drop policy if exists "listing_categories_public_select" on public.listing_categories;
create policy "listing_categories_public_select"
on public.listing_categories
for select
using (
  exists (
    select 1
    from public.listings l
    where l.id = listing_categories.listing_id
      and (l.published = true or public.can_manage_owner(l.owner_provider_id))
  )
);

drop policy if exists "listing_categories_owner_manage" on public.listing_categories;
create policy "listing_categories_owner_manage"
on public.listing_categories
for all
using (
  exists (
    select 1 from public.listings l
    where l.id = listing_categories.listing_id
      and public.can_manage_owner(l.owner_provider_id)
  )
)
with check (
  exists (
    select 1 from public.listings l
    where l.id = listing_categories.listing_id
      and public.can_manage_owner(l.owner_provider_id)
  )
);

drop policy if exists "listing_media_public_select" on public.listing_media;
create policy "listing_media_public_select"
on public.listing_media
for select
using (
  exists (
    select 1
    from public.listings l
    where l.id = listing_media.listing_id
      and (l.published = true or public.can_manage_owner(l.owner_provider_id))
  )
);

drop policy if exists "listing_media_owner_manage" on public.listing_media;
create policy "listing_media_owner_manage"
on public.listing_media
for all
using (
  exists (
    select 1 from public.listings l
    where l.id = listing_media.listing_id
      and public.can_manage_owner(l.owner_provider_id)
  )
)
with check (
  exists (
    select 1 from public.listings l
    where l.id = listing_media.listing_id
      and public.can_manage_owner(l.owner_provider_id)
  )
);

drop policy if exists "bookings_self_provider_admin_select" on public.bookings;
create policy "bookings_self_provider_admin_select"
on public.bookings
for select
using (
  auth.uid() = user_id
  or auth.uid() = provider_id
  or public.is_adminish()
);

drop policy if exists "bookings_user_insert" on public.bookings;
create policy "bookings_user_insert"
on public.bookings
for insert
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.listings l
    where l.id = bookings.listing_id
      and l.published = true
  )
);

drop policy if exists "bookings_self_provider_admin_update" on public.bookings;
create policy "bookings_self_provider_admin_update"
on public.bookings
for update
using (
  auth.uid() = user_id
  or auth.uid() = provider_id
  or public.is_adminish()
)
with check (
  auth.uid() = user_id
  or auth.uid() = provider_id
  or public.is_adminish()
);

drop policy if exists "reviews_public_approved_select" on public.reviews;
create policy "reviews_public_approved_select"
on public.reviews
for select
using (
  is_approved = true
  or auth.uid() = user_id
  or public.is_adminish()
  or exists (
    select 1 from public.listings l
    where l.id = reviews.listing_id
      and l.owner_provider_id = auth.uid()
  )
);

drop policy if exists "reviews_user_insert" on public.reviews;
create policy "reviews_user_insert"
on public.reviews
for insert
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.bookings b
    where b.user_id = auth.uid()
      and b.listing_id = reviews.listing_id
  )
);

drop policy if exists "reviews_owner_or_admin_update" on public.reviews;
create policy "reviews_owner_or_admin_update"
on public.reviews
for update
using (
  auth.uid() = user_id
  or public.is_adminish()
  or exists (
    select 1 from public.listings l
    where l.id = reviews.listing_id
      and l.owner_provider_id = auth.uid()
  )
)
with check (
  auth.uid() = user_id
  or public.is_adminish()
  or exists (
    select 1 from public.listings l
    where l.id = reviews.listing_id
      and l.owner_provider_id = auth.uid()
  )
);

drop policy if exists "favorites_self_select" on public.favorites;
create policy "favorites_self_select"
on public.favorites
for select
using (auth.uid() = user_id);

drop policy if exists "favorites_self_insert" on public.favorites;
create policy "favorites_self_insert"
on public.favorites
for insert
with check (auth.uid() = user_id);

drop policy if exists "favorites_self_delete" on public.favorites;
create policy "favorites_self_delete"
on public.favorites
for delete
using (auth.uid() = user_id);

grant select on public.provider_public_profiles to anon, authenticated;
grant select on public.listing_catalog to anon, authenticated;
grant select on public.listing_detail_view to anon, authenticated;
grant select on public.review_public_view to anon, authenticated;

insert into public.categories (name)
values
  ('City tours'),
  ('Gastronomía'),
  ('Navegación'),
  ('Naturaleza'),
  ('Aventura'),
  ('Bodegas'),
  ('Museos'),
  ('Alojamiento boutique'),
  ('Cabañas'),
  ('Wellness')
on conflict (name) do nothing;

insert into storage.buckets (id, name, public)
values ('listing-media', 'listing-media', true)
on conflict (id) do nothing;

drop policy if exists "listing_media_public_read_storage" on storage.objects;
create policy "listing_media_public_read_storage"
on storage.objects
for select
using (bucket_id = 'listing-media');

drop policy if exists "listing_media_insert_storage" on storage.objects;
create policy "listing_media_insert_storage"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'listing-media'
  and (
    public.is_adminish()
    or auth.uid()::text = (storage.foldername(name))[1]
  )
);

drop policy if exists "listing_media_update_storage" on storage.objects;
create policy "listing_media_update_storage"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'listing-media'
  and (
    public.is_adminish()
    or auth.uid()::text = (storage.foldername(name))[1]
  )
)
with check (
  bucket_id = 'listing-media'
  and (
    public.is_adminish()
    or auth.uid()::text = (storage.foldername(name))[1]
  )
);

drop policy if exists "listing_media_delete_storage" on storage.objects;
create policy "listing_media_delete_storage"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'listing-media'
  and (
    public.is_adminish()
    or auth.uid()::text = (storage.foldername(name))[1]
  )
);
