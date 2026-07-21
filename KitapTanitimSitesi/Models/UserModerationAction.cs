using System.ComponentModel.DataAnnotations;

namespace KitapTanitimSitesi.Models
{
    // ---- YENİ: Kullanıcı ceza/uyarı geçmişi (Faz Ekstra 2.0) ----
    // Append-only: bu tablo hiçbir zaman UPDATE edilmez, sadece INSERT.
    // "Cezayı kaldır/uzat/kısalt" gibi işlemler yeni bir satır eklemek demektir.
    // Kullanıcının güncel ceza durumu, en son CreatedAt'e sahip satıra bakılarak
    // canlı hesaplanır (bu mantık Faz Ekstra 2.2'de uygulanacak).
    public class UserModerationAction
    {
        [Key]
        public int Id { get; set; }

        [Required]
        public int UserID { get; set; }

        // Örn: "Uyarı", "YorumYasağı", "TamBan", "YasakKaldırma", "YasakUzatma", "YasakKısaltma"
        [Required, MaxLength(30)]
        public string ActionType { get; set; } = string.Empty;

        [MaxLength(2000)]
        public string? Note { get; set; }

        public int? RelatedRatingID { get; set; }
        public int? RelatedReportID { get; set; }

        public DateTime? StartDate { get; set; }
        public DateTime? EndDate { get; set; } // null = süresiz/kalıcı

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        [Required]
        public int CreatedByAdminId { get; set; }

        // Navigation properties
        public User? User { get; set; }
        public BookRating? RelatedRating { get; set; }
        public Report? RelatedReport { get; set; }
        public User? CreatedByAdmin { get; set; }
    }
}